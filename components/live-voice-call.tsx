"use client";

import { useEffect, useRef, useState } from "react";

type Provider = "gemini" | "openai";
type CallState = "connecting" | "live" | "stopping" | "stopped" | "error";

interface LiveVoiceCallProps {
  onComplete: (result: { transcript: string; recordingId: string; durationMs: number }) => Promise<void> | void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

interface SessionPayload {
  provider?: Provider;
  gatewayToken?: string;
  gatewayUrl?: string;
  clientSecret?: string;
  model?: string;
  instructions?: string;
  error?: string;
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + step, bytes.length)));
  }
  return btoa(binary);
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function pcm16FromFloat32(input: Float32Array, inputSampleRate: number) {
  const outputLength = Math.max(1, Math.round(input.length * 16_000 / inputSampleRate));
  const pcm = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * inputSampleRate / 16_000;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(lower + 1, input.length - 1);
    const weight = sourceIndex - lower;
    const sample = (input[lower] ?? 0) * (1 - weight) + (input[upper] ?? 0) * weight;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return new Uint8Array(pcm.buffer);
}

function pcm24kToAudioBuffer(context: AudioContext, data: Uint8Array) {
  const samples = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2));
  const buffer = context.createBuffer(1, samples.length, 24_000);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) channel[index] = samples[index] / 0x8000;
  return buffer;
}

export function LiveVoiceCall({ onComplete, onError, onCancel }: LiveVoiceCallProps) {
  const [state, setState] = useState<CallState>("connecting");
  const [message, setMessage] = useState("Requesting a secure live session…");
  const [provider, setProvider] = useState<Provider | null>(null);
  const [transcript, setTranscript] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const [micMuted, setMicMuted] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const startedAtRef = useRef(0);
  const transcriptRef = useRef("");
  const uploadQueueRef = useRef(Promise.resolve());
  const stoppingRef = useRef(false);
  const playbackTimeRef = useRef(0);

  function appendTranscript(label: "Caller" | "Assistant", text: string) {
    const clean = text.trim();
    if (!clean) return;
    const lines = transcriptRef.current ? transcriptRef.current.split("\n") : [];
    const prefix = `${label}:`;
    if (lines.at(-1)?.startsWith(prefix)) lines[lines.length - 1] = `${prefix} ${clean}`;
    else lines.push(`${prefix} ${clean}`);
    transcriptRef.current = lines.join("\n");
    setTranscript(transcriptRef.current);
  }

  async function uploadRawChunk(blob: Blob) {
    const recordingId = recordingIdRef.current;
    if (!recordingId) return;
    const form = new FormData();
    form.append("audio", blob, "live-call.webm");
    form.append("sequence", String(sequenceRef.current));
    form.append("durationMs", String(Math.max(0, Date.now() - startedAtRef.current)));
    form.append("transcriptSoFar", transcriptRef.current);
    const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/chunks?rawOnly=true`, { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "A raw audio chunk could not be stored.");
    sequenceRef.current += 1;
  }

  function queueRawChunk(blob: Blob) {
    uploadQueueRef.current = uploadQueueRef.current.then(() => uploadRawChunk(blob));
    void uploadQueueRef.current.catch((error: unknown) => {
      const nextMessage = error instanceof Error ? error.message : "Raw audio storage failed.";
      setMessage(nextMessage);
    });
  }

  function playGeminiAudio(data: string) {
    const context = audioContextRef.current;
    if (!context) return;
    const buffer = pcm24kToAudioBuffer(context, bytesFromBase64(data));
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime, playbackTimeRef.current);
    source.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  }

  async function startGemini(stream: MediaStream, gatewayUrl: string, gatewayToken: string) {
    const context = new AudioContext();
    await context.resume();
    audioContextRef.current = context;
    const separator = gatewayUrl.includes("?") ? "&" : "?";
    const socket = new WebSocket(`${gatewayUrl}${separator}ticket=${encodeURIComponent(gatewayToken)}`);
    socketRef.current = socket;

    const connected = new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("The ADC Gemini Live gateway could not connect.")), { once: true });
    });

    socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(typeof event.data === "string" ? event.data : "{}");
        const content = payload.serverContent;
        if (content?.inputTranscription?.text) appendTranscript("Caller", content.inputTranscription.text);
        if (content?.outputTranscription?.text) appendTranscript("Assistant", content.outputTranscription.text);
        for (const part of content?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) playGeminiAudio(part.inlineData.data);
        }
      } catch {
        setMessage("Gemini returned an unreadable live response.");
      }
    });

    await connected;
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silence = context.createGain();
    silence.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const audio = pcm16FromFloat32(event.inputBuffer.getChannelData(0), context.sampleRate);
      socket.send(JSON.stringify({ realtimeInput: { audio: { data: base64FromBytes(audio), mimeType: "audio/pcm;rate=16000" } } }));
    };
    source.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
    processorRef.current = processor;
  }

  async function startOpenAi(stream: MediaStream, clientSecret: string, model: string, instructions: string) {
    const peer = new RTCPeerConnection();
    peerRef.current = peer;
    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    remoteAudio.setAttribute("aria-hidden", "true");
    remoteAudio.style.display = "none";
    remoteAudioRef.current = remoteAudio;
    document.body.appendChild(remoteAudio);
    peer.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
    };
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    const events = peer.createDataChannel("oai-events");
    events.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string; delta?: string; transcript?: string };
        if (payload.type === "conversation.item.input_audio_transcription.completed" && payload.transcript) appendTranscript("Caller", payload.transcript);
        if (payload.type === "response.output_audio_transcript.delta" && payload.delta) appendTranscript("Assistant", payload.delta);
        if (payload.type === "response.output_text.delta" && payload.delta) appendTranscript("Assistant", payload.delta);
      } catch {
        setMessage("OpenAI returned an unreadable live response.");
      }
    });
    events.addEventListener("open", () => {
      events.send(JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          model,
          instructions,
          audio: { input: { turn_detection: { type: "server_vad" } } },
        },
      }));
    }, { once: true });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      body: offer.sdp,
    });
    if (!response.ok) throw new Error(`OpenAI Live could not connect (HTTP ${response.status}).`);
    const answer = await response.text();
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
  }

  async function stopProvider() {
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
    }
  }
  function toggleMute() {
    const nextMuted = !micMuted;
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  }

  async function cancelCall() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    setState("stopping");
    setMessage("Cancelling the live session…");
    await stopProvider();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
      recorder.stop();
      await stopped;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    await uploadQueueRef.current;
    recorderRef.current = null;
    streamRef.current = null;
    setState("stopped");
    setMessage("Call cancelled before connecting.");
    onCancel?.();
  }

  async function stopCall() {
    if (stoppingRef.current || state === "stopped") return;
    stoppingRef.current = true;
    setState("stopping");
    setMessage("Stopping the live session and saving the raw audio…");
    await stopProvider();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
      recorder.stop();
      await stopped;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    await uploadQueueRef.current;
    const recordingId = recordingIdRef.current;
    const durationMs = Math.max(0, Date.now() - startedAtRef.current);
    if (!recordingId) throw new Error("The raw recording session was not created.");
    const completeResponse = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMs }),
    });
    const completePayload = (await completeResponse.json().catch(() => ({}))) as { error?: string };
    if (!completeResponse.ok) throw new Error(completePayload.error ?? "The raw recording could not be completed.");
    setState("stopped");
    setMessage("Live call ended. Preparing the clinician review…");
    await onComplete({ transcript: transcriptRef.current, recordingId, durationMs });
  }

  async function startCall() {
    try {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support live microphone calls.");
      setState("connecting");
      setCallSeconds(0);
      setMicMuted(false);
      setMessage("Requesting a secure live session…");
      const sessionResponse = await fetch("/api/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const session = (await sessionResponse.json().catch(() => ({}))) as SessionPayload;
      if (!sessionResponse.ok || !session.provider || !session.model) throw new Error(session.error ?? "The live voice session could not be created.");
      setProvider(session.provider);
      if (session.provider === "gemini" && (!session.gatewayUrl || !session.gatewayToken)) throw new Error("Gemini did not return an ADC live gateway session.");
      if (session.provider === "openai" && !session.clientSecret) throw new Error("OpenAI did not return a live session token.");

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recordingResponse = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, contentType: mimeType }),
      });
      const recordingPayload = (await recordingResponse.json().catch(() => ({}))) as { error?: string; recording?: { id?: string } };
      if (!recordingResponse.ok || !recordingPayload.recording?.id) throw new Error(recordingPayload.error ?? "The raw recording session could not be created.");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (typeof MediaRecorder === "undefined") throw new Error("This browser does not support raw audio recording.");
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.addEventListener("dataavailable", (event) => { if (event.data.size) queueRawChunk(event.data); });
      recorder.start(1000);
      streamRef.current = stream;
      recorderRef.current = recorder;
      recordingIdRef.current = recordingPayload.recording.id;
      startedAtRef.current = Date.now();
      sequenceRef.current = 0;
      transcriptRef.current = "";
      setTranscript("");
      setMessage(`${session.provider === "gemini" ? "Gemini" : "OpenAI"} Live is connected. Speak naturally; you can interrupt the assistant.`);

      if (session.provider === "gemini") await startGemini(stream, session.gatewayUrl!, session.gatewayToken!);
      else await startOpenAi(stream, session.clientSecret!, session.model!, session.instructions ?? "You are a supervised care-intake assistant.");
      setState("live");
    } catch (error) {
      await stopProvider();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setState("error");
      const errorMessage = error instanceof Error ? error.message : "The live voice call could not start.";
      setMessage(errorMessage);
      onError?.(errorMessage);
    }
  }

  useEffect(() => {
    if (state !== "live") return;
    const interval = window.setInterval(() => setCallSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  useEffect(() => {
    void startCall();
    return () => {
      void stopProvider();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const minutes = Math.floor(callSeconds / 60).toString().padStart(2, "0");
  const seconds = (callSeconds % 60).toString().padStart(2, "0");
  const callHeading = state === "live" ? "You are connected" : state === "stopping" ? "Ending the call" : state === "error" ? "Call unavailable" : "Connecting securely";
  const callStatus = state === "live" ? "Live with your care assistant" : state === "stopping" ? "Saving the call safely" : state === "error" ? "The call could not connect" : "Please wait";

  return (
    <div className="live-call-card" aria-live="polite">
      <div className="live-call-header">
        <div>
          <p className="eyebrow">Live AI care call</p>
          <h2 id="live-call-heading">{callHeading}</h2>
        </div>
        <span className={`call-chip call-chip--${state === "live" ? "live" : state === "error" ? "error" : "ready"}`}>{provider ?? "secure"}</span>
      </div>

      <div className="live-call-stage">
        <span className="live-call-avatar" aria-hidden="true">24</span>
        <p className="live-call-participant">Care assistant</p>
        <p className="live-call-status"><span className={`live-call-status-dot ${state === "live" ? "is-live" : ""}`} aria-hidden="true" />{callStatus}</p>
        <strong className="live-call-duration" aria-label={`Call duration ${minutes} minutes ${seconds} seconds`}>{minutes}:{seconds}</strong>
      </div>

      <p className="microcopy">{message}</p>

      <div className="live-call-controls" aria-label="Call controls">
        {state === "live" ? (
          <button
            className={`call-action-button ${micMuted ? "is-active" : ""}`}
            type="button"
            onClick={toggleMute}
            aria-pressed={micMuted}
          >
            <span className="call-action-icon" aria-hidden="true">{micMuted ? "×" : "⌁"}</span>
            <span>{micMuted ? "Unmute" : "Mute"}</span>
          </button>
        ) : null}
        {state === "live" ? (
          <button className="call-end-button" type="button" onClick={() => void stopCall()} aria-label="End call and submit for clinician review">
            <span className="call-end-icon" aria-hidden="true">×</span>
            <span>End call</span>
          </button>
        ) : null}
        {state === "connecting" ? (
          <button className="secondary-button call-cancel-button" type="button" onClick={() => void cancelCall()}>
            Cancel connection
          </button>
        ) : null}
      </div>

      <div className="live-call-transcript" role="log" aria-label="Live call transcript">
        {transcript || "The live transcript will appear here as you speak."}
      </div>
      {state === "stopping" ? <p className="microcopy">Do not close this page while the recording is being saved.</p> : null}
      {state === "error" ? <button className="secondary-button" type="button" onClick={() => void startCall()}>Try live call again</button> : null}
    </div>
  );
}
