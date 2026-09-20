"use client";

import { useMemo, useRef, useState } from "react";
import { AuthPanel, type AuthenticatedAppUser } from "@/components/auth-panel";
import { LiveVoiceCall } from "@/components/live-voice-call";
import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { getDemoUserForRole, portalRoles, type PortalRole } from "@/lib/demo-auth";
import { buildIntakeTranscript, intakeQuestions, type IntakeCaseDraft } from "@/lib/intake";
import { applySeverityPolicy, assessDemoTranscript } from "@/lib/triage";
import type { Assessment, TriageResult } from "@/lib/types";

interface PatientPortalProps {
  role: Exclude<PortalRole, "clinician">;
  userName: string;
  authenticated: boolean;
  onRoleChange: (role: PortalRole) => void;
  onAuthenticated: (user: AuthenticatedAppUser) => void;
  onCaseCreated: (draft: IntakeCaseDraft) => void;
  onOpenAuth: () => void;
  authOpen: boolean;
  onCloseAuth: () => void;
}
type RecorderState = "idle" | "recording" | "processing" | "stopped" | "error";

export function PatientPortal({ role, userName, authenticated, onRoleChange, onAuthenticated, onCaseCreated, onOpenAuth, authOpen, onCloseAuth }: PatientPortalProps) {
  const [hasConsent, setHasConsent] = useState(false);
  const [callback, setCallback] = useState("+91 ••••• 4821");
  const [caseAlias, setCaseAlias] = useState("Meera Krishnan");
  const [started, setStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const [liveCallOpen, setLiveCallOpen] = useState(false);
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [recordingMessage, setRecordingMessage] = useState("");
  const [recordingTranscript, setRecordingTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const recordingSequenceRef = useRef(0);
  const recordingTranscriptRef = useRef("");
  const recordingStartedAtRef = useRef(0);
  const pendingUploadsRef = useRef<Set<Promise<void>>>(new Set());
  const recordingUploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [error, setError] = useState("");

  const user = getDemoUserForRole(role);
  const question = intakeQuestions[questionIndex];
  const progress = started ? `${questionIndex + 1} of ${intakeQuestions.length}` : "Ready when you are";
  const hasCompleted = Boolean(assessment && triage);
  const priorityLabel = useMemo(() => {
    if (!triage) return "Awaiting your answers";
    return triage.ruleTitle;
  }, [triage]);

  function speakQuestion() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(question.prompt));
  }

  function startIntake() {
    if (!hasConsent) return;
    setStarted(true);
    setError("");
  }

  async function persistDraft(draft: IntakeCaseDraft): Promise<string | undefined> {
    if (!authenticated) return undefined;
    const response = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseAlias: draft.caseAlias,
        relationship: draft.relationship,
        callback: draft.callback,
        transcript: draft.transcript,
        intakeConsent: true,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; case?: { id?: string } };
    if (!response.ok) throw new Error(payload.error ?? "The case could not be saved.");
    return payload.case?.id;
  }
  async function uploadRecordingChunk(blob: Blob) {
    const recordingId = recordingIdRef.current;
    if (!recordingId) return;
    const form = new FormData();
    form.append("audio", blob, "care-call.webm");
    form.append("sequence", String(recordingSequenceRef.current));
    form.append("durationMs", String(Math.max(0, Date.now() - recordingStartedAtRef.current)));
    form.append("transcriptSoFar", recordingTranscriptRef.current);
    const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/chunks`, { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; transcript?: string; nextPrompt?: string | null };
    if (!response.ok) throw new Error(payload.error ?? "The audio chunk could not be processed.");
    recordingSequenceRef.current += 1;
    if (payload.transcript) {
      recordingTranscriptRef.current = [recordingTranscriptRef.current, payload.transcript].filter(Boolean).join(" ");
      setRecordingTranscript(recordingTranscriptRef.current);
    }
    if (payload.nextPrompt && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(payload.nextPrompt));
    }
  }

  async function completeRecordedCall() {
    const recordingId = recordingIdRef.current;
    const transcript = recordingTranscriptRef.current.trim();
    if (!recordingId || !transcript) throw new Error("No processed speech was captured from the call.");

    const assessmentResponse = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    const output = (await assessmentResponse.json().catch(() => ({}))) as { error?: string; assessment?: Assessment; triage?: TriageResult };
    if (!assessmentResponse.ok || !output.assessment || !output.triage) throw new Error(output.error ?? "The processed call could not be assessed.");

    setAssessment(output.assessment);
    setTriage(output.triage);
    const draft: IntakeCaseDraft = {
      caseAlias,
      relationship: role === "caretaker" ? "Caretaker" : "Patient",
      callback,
      transcript,
      assessment: output.assessment,
      triage: output.triage,
    };
    const persistedCaseId = await persistDraft(draft);
    await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: persistedCaseId ?? null, durationMs: Math.max(0, Date.now() - recordingStartedAtRef.current) }),
    });
    onCaseCreated(persistedCaseId ? { ...draft, persistedCaseId } : draft);
  }

  async function completeLiveCall(result: { transcript: string; recordingId: string; durationMs: number }) {
    const transcript = result.transcript.trim();
    if (!transcript) throw new Error("No spoken transcript was captured from the live call.");
    setRecordingTranscript(transcript);
    setRecorderState("processing");
    const assessmentResponse = await fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    const output = (await assessmentResponse.json().catch(() => ({}))) as { error?: string; assessment?: Assessment; triage?: TriageResult };
    if (!assessmentResponse.ok || !output.assessment || !output.triage) throw new Error(output.error ?? "The live call could not be assessed.");

    setAssessment(output.assessment);
    setTriage(output.triage);
    const draft: IntakeCaseDraft = {
      caseAlias,
      relationship: role === "caretaker" ? "Caretaker" : "Patient",
      callback,
      transcript,
      assessment: output.assessment,
      triage: output.triage,
    };
    const persistedCaseId = await persistDraft(draft);
    onCaseCreated(persistedCaseId ? { ...draft, persistedCaseId } : draft);
    setLiveCallOpen(false);
    setRecorderState("stopped");
    setRecordingMessage(`Live call saved with ${result.durationMs}ms of raw audio for clinician review.`);
  }

  async function startRecordedCall() {
    if (!authenticated || !hasConsent || recorderState === "recording") return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingMessage("This browser does not support in-app audio recording.");
      setRecorderState("error");
      return;
    }

    try {
      setRecordingMessage("Requesting microphone permission…");
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const sessionResponse = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, contentType: mimeType }),
      });
      const sessionPayload = (await sessionResponse.json().catch(() => ({}))) as { error?: string; recording?: { id?: string } };
      if (!sessionResponse.ok || !sessionPayload.recording?.id) throw new Error(sessionPayload.error ?? "The recording session could not be created.");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingIdRef.current = sessionPayload.recording.id;
      recordingSequenceRef.current = 0;
      recordingUploadQueueRef.current = Promise.resolve();
      recordingTranscriptRef.current = "";
      setRecordingTranscript("");
      recordingStartedAtRef.current = Date.now();
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        const uploadPromise = recordingUploadQueueRef.current
          .then(() => uploadRecordingChunk(event.data))
          .catch((error: unknown) => {
            setRecordingMessage(error instanceof Error ? error.message : "Audio processing failed.");
            setRecorderState("error");
            throw error;
          });
        recordingUploadQueueRef.current = uploadPromise;
        pendingUploadsRef.current.add(uploadPromise);
        void uploadPromise.finally(() => pendingUploadsRef.current.delete(uploadPromise)).catch(() => undefined);
      };
      recorder.start(5000);
      setStarted(true);
      setRecorderState("recording");
      setRecordingMessage("Recording and processing live audio. Raw chunks are stored in private Supabase Storage.");
    } catch (startError) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      setRecorderState("error");
      setRecordingMessage(startError instanceof Error ? startError.message : "The audio call could not start.");
    }
  }
  function startLiveCall() {
    if (!hasConsent || liveCallOpen) return;
    if (!authenticated) {
      onOpenAuth();
      return;
    }
    setError("");
    setStarted(true);
    setRecorderState("recording");
    setLiveCallOpen(true);
  }


  async function stopRecordedCall() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setRecorderState("processing");
    setRecordingMessage("Finishing upload and processing the captured audio…");
    const stopped = new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });
    recorder.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    await stopped;
    const uploadResults = await Promise.allSettled([...pendingUploadsRef.current]);
    if (uploadResults.some((result) => result.status === "rejected")) {
      setRecorderState("error");
      setRecordingMessage("One or more audio chunks failed to upload; the call was not submitted.");
      return;
    }
    try {
      await completeRecordedCall();
      setRecorderState("stopped");
      setRecordingMessage("The processed call was submitted for clinician review.");
    } catch (stopError) {
      setRecorderState("error");
      setRecordingMessage(stopError instanceof Error ? stopError.message : "The processed call could not be submitted.");
    } finally {
      recorderRef.current = null;
      recordingStreamRef.current = null;
    }
  }


  async function finishIntake(nextAnswers: Record<string, string>) {
    const transcript = buildIntakeTranscript(nextAnswers);
    setIsAssessing(true);
    setError("");

    let output: { assessment: Assessment; triage: TriageResult };
    try {
      const response = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      if (!response.ok) throw new Error("Assessment unavailable");
      output = (await response.json()) as { assessment: Assessment; triage: TriageResult };
    } catch {
      const localAssessment = assessDemoTranscript(transcript, demoClinicalPolicy);
      output = { assessment: localAssessment, triage: applySeverityPolicy(localAssessment, demoClinicalPolicy) };
      setError("The assessment service was unavailable, so this demo used its local safety policy.");
    }

    const draft: IntakeCaseDraft = {
      caseAlias,
      relationship: role === "caretaker" ? "Caretaker" : "Patient",
      callback,
      transcript,
      assessment: output.assessment,
      triage: output.triage,
    };
    setAssessment(output.assessment);
    setTriage(output.triage);
    let persistedCaseId: string | undefined;
    try {
      persistedCaseId = await persistDraft(draft);
      if (authenticated) setError("");
    } catch (persistenceError) {
      setError(persistenceError instanceof Error ? persistenceError.message : "The case could not be saved.");
    }
    onCaseCreated(persistedCaseId ? { ...draft, persistedCaseId } : draft);
    setIsAssessing(false);
  }

  function submitAnswer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanAnswer = answer.trim();
    if (!cleanAnswer || isAssessing) return;

    const nextAnswers = { ...answers, [question.id]: cleanAnswer };
    setAnswers(nextAnswers);
    setAnswer("");

    if (questionIndex === intakeQuestions.length - 1) {
      void finishIntake(nextAnswers);
      return;
    }
    setQuestionIndex((current) => current + 1);
  }

  function chooseAnswer(option: string) {
    setAnswer(option);
  }

  function restart() {
    setHasConsent(false);
    setStarted(false);
    setQuestionIndex(0);
    setAnswer("");
    setAnswers({});
    setAssessment(null);
    setTriage(null);
    setError("");
    setRecorderState("idle");
    setRecordingMessage("");
    setRecordingTranscript("");
    recordingIdRef.current = null;
    recordingTranscriptRef.current = "";
  }

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">24</span>
          <div>
            <p className="eyebrow">IPM care access</p>
            <p className="brand-title">Care desk</p>
          </div>
        </div>
        <div className="portal-topbar-actions">
          <label className="role-switch">
            {authenticated ? "Account role" : "Demo role"}
            {authenticated ? <span className="quiet-badge">{role}</span> : <select value={role} onChange={(event) => onRoleChange(event.target.value as PortalRole)}>{portalRoles.map((availableRole) => <option key={availableRole} value={availableRole}>{availableRole}</option>)}</select>}
          </label>
          <button className="text-button portal-auth-button" type="button" onClick={onOpenAuth}>{authenticated ? "Live account" : "Sign in"}</button>
          <span className="user-chip" aria-label={`Signed in as ${userName}`}>{userName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
        </div>
      </header>

      <div className="portal-content">
        <section className="portal-intro">
          <div>
            <p className="eyebrow">{user.subtitle}</p>
            <h1>Talk to the care team</h1>
            <p className="portal-lede">Share what is happening in your own words. A guided assistant will ask a few questions and prepare the information for a clinician to review.</p>
          </div>
          <div className="portal-status"><span className="status-dot status-dot--safe" />{user.patientLabel}</div>
        </section>
        {authOpen ? <AuthPanel onAuthenticated={onAuthenticated} onClose={onCloseAuth} /> : null}

        <div className="portal-grid">
          <section className="panel call-panel" aria-labelledby="call-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Guided intake</p>
                <h2 id="call-heading">Start a care request</h2>
              </div>
              <span className={`call-chip call-chip--${started && !hasCompleted ? "live" : "ready"}`}>{hasCompleted ? "submitted" : started ? "live" : "ready"}</span>
            </div>

            {liveCallOpen ? (
              <div className="live-call-shell" role="dialog" aria-modal="true" aria-labelledby="live-call-heading">
                <LiveVoiceCall
                  onComplete={completeLiveCall}
                  onError={(message) => {
                    setRecorderState("error");
                    setRecordingMessage(message);
                  }}
                  onCancel={() => {
                    setLiveCallOpen(false);
                    setStarted(false);
                    setRecorderState("idle");
                    setRecordingMessage("Live call cancelled before connecting.");
                  }}
                />
              </div>
            ) : !started && !hasCompleted && recorderState === "idle" ? (
              <>
                <div className="portal-call-preview">
                  <span className="portal-call-icon" aria-hidden="true">⌁</span>
                  <div><strong>In-app guided call</strong><p>Questions appear one at a time so you can answer clearly. You can type in Malayalam, English, or both.</p></div>
                </div>
                <div className="field-grid portal-fields">
                  <label>Patient or case name<input value={caseAlias} onChange={(event) => setCaseAlias(event.target.value)} /></label>
                  <label>Safe callback number<input value={callback} onChange={(event) => setCallback(event.target.value)} /></label>
                </div>
                <label className="consent-box check-row"><input type="checkbox" checked={hasConsent} onChange={(event) => setHasConsent(event.target.checked)} /><span>I understand this guided intake is not a diagnosis. I consent to sharing these answers with the care team for review.</span></label>
                <button className="primary-button portal-start" onClick={startIntake} disabled={!hasConsent}>Start guided intake</button>
                <button className="primary-button portal-start" type="button" onClick={startLiveCall} disabled={!hasConsent}>{authenticated ? "Start live AI call" : "Sign in to start live AI call"}</button>
                <button className="secondary-button portal-start" type="button" onClick={() => {
                  if (!authenticated) {
                    onOpenAuth();
                    return;
                  }
                  void startRecordedCall();
                }} disabled={!hasConsent}>{authenticated ? "Start recorded AI call" : "Sign in to start recorded AI call"}</button>
                <p className="microcopy">{authenticated ? "Live calls stream audio to the selected provider and archive consented caller audio in private Supabase Storage. A clinician reviews the resulting case." : "Sign in is required before microphone access and private audio storage. Guided intake remains available without an account."}</p>
              </>
            ) : hasCompleted ? (
              <div className="portal-complete" role="status">
                <span className="complete-mark" aria-hidden="true">✓</span>
                <div><p className="eyebrow">Request submitted</p><h2>Clinician review requested</h2><p>Your answers were added to the review queue. No treatment, dispatch, or referral was sent automatically.</p></div>
                <div className={`priority-banner priority-banner--${triage?.priority === "immediate_clinician_review" ? "critical" : triage?.priority === "urgent_review" ? "urgent" : triage?.priority === "same_day_queue" ? "same-day" : triage?.priority === "routine_queue" ? "routine" : "unknown"}`}><span className="priority-kicker">Prepared priority</span><strong>{priorityLabel}</strong><span>Policy {triage?.policyVersion}</span></div>
                <button className="secondary-button" onClick={restart}>Start another request</button>
              </div>
            ) : recorderState !== "idle" ? (
              <div className="portal-complete">
                <div className="assistant-message"><span className="assistant-avatar" aria-hidden="true">AI</span><div><p className="eyebrow">Recorded AI intake</p><p>{recorderState === "recording" ? "The care agent is listening and asking questions." : recorderState === "processing" ? "Audio is being transcribed and assessed." : "The recorded call is ready for review."}</p></div></div>
                <p className="evidence-quote">{recordingTranscript || "No transcript has been returned yet."}</p>
                {recorderState === "recording" ? <button className="danger-button" type="button" onClick={() => void stopRecordedCall()}>Stop and submit call</button> : null}
                {recordingMessage ? <p className="microcopy">{recordingMessage}</p> : null}
              </div>
            ) : (
              <>
                <div className="intake-progress"><span>Question {progress}</span><span>{Math.round(((questionIndex + 1) / intakeQuestions.length) * 100)}%</span></div>
                <div className="progress-track"><span style={{ width: `${((questionIndex + 1) / intakeQuestions.length) * 100}%` }} /></div>
                <div className="assistant-message"><span className="assistant-avatar" aria-hidden="true">AI</span><div><p className="eyebrow">Care intake assistant</p><p>{question.prompt}</p></div></div>
                <button className="text-button speak-button" onClick={speakQuestion} type="button">Hear this question</button>
                <form onSubmit={submitAnswer} className="answer-form">
                  {question.kind === "text" ? <textarea autoFocus value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer here…" rows={5} aria-label={question.label} /> : <div className="choice-grid" role="group" aria-label={question.label}>{question.options?.map((option) => <button key={option} type="button" className={`choice-button ${answer === option ? "is-selected" : ""}`} onClick={() => chooseAnswer(option)} aria-pressed={answer === option}>{option}</button>)}</div>}
                  <p className="microcopy">{question.helper}</p>
                  <button className="primary-button" type="submit" disabled={!answer.trim() || isAssessing}>{isAssessing ? "Preparing review…" : questionIndex === intakeQuestions.length - 1 ? "Submit for clinician review" : "Continue"}</button>
                </form>
              </>
            )}
            {error ? <p className="inline-error" role="alert">{error}</p> : null}
          </section>

          <aside className="portal-side">
            <section className="panel safety-panel">
              <p className="eyebrow">Safety boundary</p>
              <h2>A person reviews every request</h2>
              <p>The assistant can miss information. A clinician must review the answers and decide what happens next.</p>
              <ul className="safety-list"><li>If you think there is immediate danger, contact local emergency services now.</li><li>Do not wait for this website to respond to an emergency.</li><li>Keep your phone available for a possible callback.</li></ul>
            </section>
            <section className="panel steps-panel">
              <p className="eyebrow">What happens next</p>
              <ol className="steps-list"><li><span>01</span>Answer three short questions.</li><li><span>02</span>The policy engine prepares a review priority.</li><li><span>03</span>A clinician checks the evidence before action.</li></ol>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
