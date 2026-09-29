"use client";

import { useMemo, useRef, useState } from "react";
import { Volume2, CheckCircle2, Zap, Radio, Phone, ShieldCheck } from "lucide-react";
import { AuthPanel, type AuthenticatedAppUser } from "@/components/auth-panel";
import { LiveVoiceCall } from "@/components/live-voice-call";
import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { demoScenarios } from "@/lib/demo-data";
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

const portalContent = {
  en: {
    portalEyebrow: "IPM care access",
    portalTitle: "Care desk",
    heading: "Talk to the care team",
    lede: "Share what is happening in your own words. A guided assistant will ask a few questions and prepare the information for a clinician to review.",
    guidedIntake: "Guided intake",
    startTitle: "Start a care request",
    inAppCall: "In-app guided call",
    inAppCallDesc: "Questions appear one at a time so you can answer clearly. You can type in Malayalam, English, or both.",
    nameLabel: "Patient or case name",
    phoneLabel: "Safe callback number",
    consentText: "I understand this guided intake is not a diagnosis. I consent to sharing these answers with the care team for review.",
    startBtn: "Start guided intake",
    orVoice: "Or voice options",
    liveBtn: "Start live AI call",
    liveBtnSignIn: "Sign in for live AI call",
    recBtn: "Start recorded AI call",
    recBtnSignIn: "Sign in for recorded call",
    hearQuestion: "Hear this question",
    placeholder: "Type your answer here… (Malayalam or English)",
    submitting: "Preparing review…",
    continueBtn: "Continue",
    submitBtn: "Submit for clinician review",
    submittedHeading: "Clinician review requested",
    submittedDesc: "Your answers were added to the review queue. No treatment, dispatch, or referral was sent automatically.",
    startAnother: "Start another request",
    safetyTitle: "A person reviews every request",
    safetyBoundary: "The assistant can miss information. A clinician must review the answers and decide what happens next.",
    dangerNotice: "If you think there is immediate danger, contact local emergency services (108 / 112) now.",
    dontWait: "Do not wait for this website to respond to an emergency.",
    keepPhone: "Keep your phone available for a possible callback.",
    whatNext: "What happens next",
    step1: "Answer three short questions.",
    step2: "The policy engine prepares a review priority.",
    step3: "A clinician checks the evidence before action.",
    demoScenariosTitle: "Quick demo cases:",
    questions: [
      {
        prompt: "Please tell me in your own words what is happening and what help you need today.",
        helper: "You can write in Malayalam, English, or both.",
      },
      {
        prompt: "Which option best describes the change you are calling about?",
        helper: "Choose the closest description. A clinician will review it.",
        options: ["It suddenly became much worse", "It has increased today", "It is stable or routine", "I am not sure"],
      },
      {
        prompt: "What would you like the care team to help with?",
        helper: "Select the most important request for this call.",
        options: ["Clinical review", "Supplies today", "Routine follow-up", "I am not sure"],
      },
    ],
  },
  ml: {
    portalEyebrow: "ഐ.പി.എം പാലിയേറ്റീവ് കെയർ",
    portalTitle: "കെയർ ഡെസ്ക്",
    heading: "കെയർ ടീമുമായി സംസാരിക്കുക",
    lede: "നിങ്ങളുടെ അവസ്ഥ സ്വന്തം വാക്കുകളിൽ പങ്കുവെക്കുക. ഒരു സഹായി ചോദ്യങ്ങൾ ചോദിക്കുകയും ഡോക്ടറുടെ പരിശോധനയ്ക്കായി വിവരങ്ങൾ നൽകുകയും ചെയ്യും.",
    guidedIntake: "ഗൈഡഡ് ഇൻടേക്ക്",
    startTitle: "കെയർ അഭ്യർത്ഥന ആരംഭിക്കുക",
    inAppCall: "ഇൻ-ആപ്പ് അസിസ്റ്റന്റ്",
    inAppCallDesc: "ചോദ്യങ്ങൾ ഓരോന്നായി നൽകുന്നു. നിങ്ങൾക്ക് മലയാളത്തിലോ ഇംഗ്ലീഷിലോ മറുപടി നൽകാം.",
    nameLabel: "രോഗിയുടെ അല്ലെങ്കിൽ കേസിന്റെ പേര്",
    phoneLabel: "ബന്ധപ്പെടേണ്ട ഫോൺ നമ്പർ",
    consentText: "ഇത് ഒരു മെഡിക്കൽ രോഗനിർണ്ണയമല്ലെന്ന് ഞാൻ മനസ്സിലാക്കുന്നു. ഈ വിവരങ്ങൾ കെയർ ടീമിന് പരിശോധനയ്ക്കായി കൈമാറാൻ സമ്മതിക്കുന്നു.",
    startBtn: "ചോദ്യങ്ങളിലേക്ക് കടക്കുക",
    orVoice: "വോയ്സ് ഓപ്ഷനുകൾ",
    liveBtn: "തത്സമയ എ.ഐ കോൾ ആരംഭിക്കുക",
    liveBtnSignIn: "തത്സമയ കോളിനായി സൈൻ ഇൻ ചെയ്യുക",
    recBtn: "റെക്കോർഡഡ് എ.ഐ കോൾ",
    recBtnSignIn: "റെക്കോർഡഡ് കോളിനായി സൈൻ ഇൻ ചെയ്യുക",
    hearQuestion: "ചോദ്യം കേൾക്കുക",
    placeholder: "നിങ്ങളുടെ മറുപടി ഇവിടെ ടൈപ്പ് ചെയ്യുക (മലയാളത്തിലോ ഇംഗ്ലീഷിലോ)…",
    submitting: "പരിശോധന തയ്യാറാക്കുന്നു…",
    continueBtn: "അടുത്തത്",
    submitBtn: "ഡോക്ടറുടെ പരിശോധനയ്ക്കായി സമർപ്പിക്കുക",
    submittedHeading: "അഭ്യർത്ഥന സമർപ്പിച്ചു",
    submittedDesc: "നിങ്ങളുടെ മറുപടികൾ ഡ്യൂട്ടി ഡോക്ടറുടെ ലിസ്റ്റിൽ ഉൾപ്പെടുത്തി. സ്വമേധയാ മരുന്നുകളോ ഡിസ്പാച്ചോ നൽകിയിട്ടില്ല.",
    startAnother: "മറ്റൊരു അഭ്യർത്ഥന നൽകുക",
    safetyTitle: "എല്ലാ അഭ്യർത്ഥനകളും ഡോക്ടർ നേരിട്ട് പരിശോധിക്കും",
    safetyBoundary: "എ.ഐ അസിസ്റ്റന്റിന് വിവരങ്ങൾ പൂർണ്ണമായി മനസ്സിലാക്കാൻ കഴിഞ്ഞെന്നു വരില്ല. എന്തു വേണമെന്ന് ഡോക്ടർ തീരുമാനിക്കും.",
    dangerNotice: "അടിയന്തിര ജീവഹാനി സാഹചര്യമാണെങ്കിൽ ഉടൻ 108 അല്ലെങ്കിൽ പ്രാദേശിക എമർജൻസി നമ്പറിൽ ബന്ധപ്പെടുക.",
    dontWait: "അടിയന്തര ഘട്ടങ്ങളിൽ വെബ്സൈറ്റിലെ മറുപടിക്കായി കാത്തിരിക്കരുത്.",
    keepPhone: "കെയർ ടീം തിരിച്ചുവിളിക്കാൻ സാധ്യതയുള്ളതിനാൽ ഫോൺ കൂടെ കരുതുക.",
    whatNext: "തുടർന്നുള്ള ഘട്ടങ്ങൾ",
    step1: "മൂന്ന് ലളിതമായ ചോദ്യങ്ങൾക്ക് മറുപടി നൽകുക.",
    step2: "പോളിസി എൻജിൻ ഒരു മുൻഗണനാ ശുപാർശ തയ്യാറാക്കുന്നു.",
    step3: "ഡോക്ടർ വിവരം പരിശോധിച്ച് നടപടി ഉറപ്പാക്കുന്നു.",
    demoScenariosTitle: "ഡെമോ പ്രീസെറ്റുകൾ:",
    questions: [
      {
        prompt: "ഇന്ന് രോഗിക്ക് എന്താണ് ബുദ്ധിമുട്ട്? എന്ത് സഹായമാണ് നിങ്ങൾ പ്രതീക്ഷിക്കുന്നത്?",
        helper: "മലയാളത്തിലോ ഇംഗ്ലീഷിലോ എഴുതാം.",
      },
      {
        prompt: "ലക്ഷണങ്ങളിൽ എന്തെങ്കിലും മാറ്റം ഉണ്ടായിട്ടുണ്ടോ?",
        helper: "യോജിച്ച വിവരണം തിരഞ്ഞെടുക്കുക. ഡോക്ടർ ഇത് പരിശോധിക്കും.",
        options: ["പെട്ടെന്ന് വളരെ വഷളായി", "ഇന്ന് വർദ്ധിച്ചു", "മാറ്റമില്ല / സാധാരണ", "വ്യക്തമല്ല"],
      },
      {
        prompt: "കെയർ ടീമിൽ നിന്ന് എന്ത് സഹായമാണ് നിങ്ങൾ പ്രതീക്ഷിക്കുന്നത്?",
        helper: "ഏറ്റവും പ്രധാനപ്പെട്ട ആവശ്യം തിരഞ്ഞെടുക്കുക.",
        options: ["ഡോക്ടറുടെ പരിശോധന", "ഇന്ന് തന്നെ മരുന്നുകൾ / സാധനങ്ങൾ", "സാധാരണ ഫോളോ-അപ്പ്", "വ്യക്തമല്ല"],
      },
    ],
  },
};

function AudioWaveformVisualizer({ active }: { active: boolean }) {
  return (
    <div className={`audio-waveform ${active ? "is-active" : ""}`} aria-hidden="true">
      <span className="wave-bar bar-1" />
      <span className="wave-bar bar-2" />
      <span className="wave-bar bar-3" />
      <span className="wave-bar bar-4" />
      <span className="wave-bar bar-5" />
      <span className="wave-bar bar-6" />
      <span className="wave-bar bar-7" />
      <span className="wave-bar bar-8" />
    </div>
  );
}

export function PatientPortal({ role, userName, authenticated, onRoleChange, onAuthenticated, onCaseCreated, onOpenAuth, authOpen, onCloseAuth }: PatientPortalProps) {
  const [hasConsent, setHasConsent] = useState(false);
  const [lang, setLang] = useState<"en" | "ml">("en");
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
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
  const t = portalContent[lang];

  function playSyntheticSpeech(text: string) {
    if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "ml" ? "ml-IN" : "en-IN";
    utterance.rate = 0.95;
    setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <main className="portal-shell">
      <header className="portal-topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">24</span>
          <div>
            <p className="eyebrow">{t.portalEyebrow}</p>
            <p className="brand-title">{t.portalTitle}</p>
          </div>
        </div>
        <div className="portal-topbar-actions">
          <button
            type="button"
            className="lang-toggle-button"
            onClick={() => setLang((current) => (current === "en" ? "ml" : "en"))}
            aria-label="Switch between English and Malayalam"
          >
            {lang === "en" ? "മലയാളം" : "English"}
          </button>
          <label className="role-switch">
            {authenticated ? "Account role" : "Demo role"}
            <select
              value={role}
              aria-label={authenticated ? "Change account role preview" : "Change demo role"}
              onChange={(event) => onRoleChange(event.target.value as PortalRole)}
            >
              {portalRoles.map((availableRole) => (
                <option key={availableRole} value={availableRole}>
                  {availableRole === "clinician" ? "Clinician" : availableRole === "caretaker" ? "Caretaker" : "Patient"}
                </option>
              ))}
            </select>
          </label>
          <button className="text-button portal-auth-button" type="button" onClick={onOpenAuth}>{authenticated ? "Live account" : "Sign in"}</button>
          <span className="user-chip" aria-label={`Signed in as ${userName}`}>{userName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
        </div>
      </header>

      <div className="portal-content">
        <section className="portal-intro">
          <div>
            <p className="eyebrow">{user.subtitle}</p>
            <h1>{t.heading}</h1>
            <p className="portal-lede">{t.lede}</p>
          </div>
          <div className="portal-status"><span className="status-dot status-dot--safe" />{user.patientLabel}</div>
        </section>
        {authOpen ? <AuthPanel onAuthenticated={onAuthenticated} onClose={onCloseAuth} /> : null}

        <div className="portal-grid">
          <section className="panel call-panel" aria-labelledby="call-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{t.guidedIntake}</p>
                <h2 id="call-heading">{t.startTitle}</h2>
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
                  <span className="portal-call-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M3 12h2m3-5v10m4-13v16m4-11v6m4-3h2" />
                    </svg>
                  </span>
                  <div><strong>{t.inAppCall}</strong><p>{t.inAppCallDesc}</p></div>
                </div>
                <div className="portal-presets-bar" role="group" aria-label="Demo triage presets">
                  <span className="portal-presets-title">{t.demoScenariosTitle}</span>
                  <div className="portal-presets-chips">
                    {demoScenarios.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="portal-preset-chip"
                        onClick={() => {
                          setCaseAlias(s.alias);
                          setHasConsent(true);
                          setAnswers({
                            concern: s.concern,
                            change: s.change,
                            support: s.support,
                          });
                          setStarted(true);
                          setQuestionIndex(0);
                          setAnswer(lang === "ml" ? s.transcript : s.concern);
                        }}
                      >
                        <Zap size={11} className="preset-chip-icon" /> {lang === "ml" ? s.malayalamTitle : s.title}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field-grid portal-fields">
                  <label>{t.nameLabel}<input value={caseAlias} onChange={(event) => setCaseAlias(event.target.value)} /></label>
                  <label>{t.phoneLabel}<input value={callback} onChange={(event) => setCallback(event.target.value)} /></label>
                </div>
                <label className="consent-box check-row"><input type="checkbox" checked={hasConsent} onChange={(event) => setHasConsent(event.target.checked)} /><span>{t.consentText}</span></label>
                
                <button className="primary-button portal-start portal-start-main" onClick={startIntake} disabled={!hasConsent}>
                  {t.startBtn}
                </button>

                <div className="portal-alt-options">
                  <div className="portal-alt-divider">
                    <span>{t.orVoice}</span>
                  </div>
                  <div className="portal-voice-actions">
                    <button className="secondary-button portal-start-secondary" type="button" onClick={startLiveCall} disabled={!hasConsent}>
                      {authenticated ? t.liveBtn : t.liveBtnSignIn}
                    </button>
                    <button className="secondary-button portal-start-secondary" type="button" onClick={() => {
                      if (!authenticated) {
                        onOpenAuth();
                        return;
                      }
                      void startRecordedCall();
                    }} disabled={!hasConsent}>
                      {authenticated ? t.recBtn : t.recBtnSignIn}
                    </button>
                  </div>
                </div>

                <p className="microcopy">{authenticated ? "Live calls stream audio to the selected provider and archive consented caller audio in private Supabase Storage. A clinician reviews the resulting case." : "Sign in is required before microphone access and private audio storage. Guided intake remains available without an account."}</p>
              </>
            ) : hasCompleted ? (
              <div className="portal-complete" role="status">
                <CheckCircle2 size={36} className="complete-mark-svg" aria-hidden="true" />
                <div><p className="eyebrow">Request submitted</p><h2>{t.submittedHeading}</h2><p>{t.submittedDesc}</p></div>
                <div className={`priority-banner priority-banner--${triage?.priority === "immediate_clinician_review" ? "critical" : triage?.priority === "urgent_review" ? "urgent" : triage?.priority === "same_day_queue" ? "same-day" : triage?.priority === "routine_queue" ? "routine" : "unknown"}`}><span className="priority-kicker">Prepared priority</span><strong>{priorityLabel}</strong><span>Policy {triage?.policyVersion}</span></div>
                <button className="secondary-button" onClick={restart}>{t.startAnother}</button>
              </div>
            ) : recorderState !== "idle" ? (
              <div className="portal-complete">
                <div className="assistant-message"><span className="assistant-avatar" aria-hidden="true">AI</span><div><p className="eyebrow">Recorded AI intake</p><p>{recorderState === "recording" ? "The care agent is listening and asking questions." : recorderState === "processing" ? "Audio is being transcribed and assessed." : "The recorded call is ready for review."}</p></div></div>
                <AudioWaveformVisualizer active={recorderState === "recording" || isPlayingAudio} />
                <p className="evidence-quote">{recordingTranscript || "No transcript has been returned yet."}</p>
                {recordingTranscript ? (
                  <button type="button" className="text-button" onClick={() => playSyntheticSpeech(recordingTranscript)}>
                    <Volume2 size={14} /> {isPlayingAudio ? "Playing audio…" : "Listen to transcript"}
                  </button>
                ) : null}
                {recorderState === "recording" ? <button className="danger-button" type="button" onClick={() => void stopRecordedCall()}>Stop and submit call</button> : null}
                {recordingMessage ? <p className="microcopy">{recordingMessage}</p> : null}
              </div>
            ) : (
              <>
                <div className="intake-progress"><span>Question {progress}</span><span>{Math.round(((questionIndex + 1) / intakeQuestions.length) * 100)}%</span></div>
                <div className="progress-track"><span style={{ width: `${((questionIndex + 1) / intakeQuestions.length) * 100}%` }} /></div>
                <div className="assistant-message"><span className="assistant-avatar" aria-hidden="true">AI</span><div><p className="eyebrow">Care intake assistant</p><p>{t.questions[questionIndex]?.prompt ?? question.prompt}</p></div></div>
                <button className="text-button speak-button" onClick={speakQuestion} type="button">{t.hearQuestion}</button>
                <form onSubmit={submitAnswer} className="answer-form">
                  {question.kind === "text" ? <textarea autoFocus value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={t.placeholder} rows={5} aria-label={question.label} /> : <div className="choice-grid" role="group" aria-label={question.label}>{(t.questions[questionIndex]?.options ?? question.options)?.map((option) => <button key={option} type="button" className={`choice-button ${answer === option ? "is-selected" : ""}`} onClick={() => chooseAnswer(option)} aria-pressed={answer === option}>{option}</button>)}</div>}
                  <p className="microcopy">{t.questions[questionIndex]?.helper ?? question.helper}</p>
                  <button className="primary-button" type="submit" disabled={!answer.trim() || isAssessing}>{isAssessing ? t.submitting : questionIndex === intakeQuestions.length - 1 ? t.submitBtn : t.continueBtn}</button>
                </form>
              </>
            )}
            {error ? <p className="inline-error" role="alert">{error}</p> : null}
          </section>

          <aside className="portal-side">
            <section className="panel safety-panel">
              <p className="eyebrow">Safety boundary</p>
              <h2>{t.safetyTitle}</h2>
              <p>{t.safetyBoundary}</p>
              <ul className="safety-list"><li>{t.dangerNotice}</li><li>{t.dontWait}</li><li>{t.keepPhone}</li></ul>
            </section>
            <section className="panel steps-panel">
              <p className="eyebrow">{t.whatNext}</p>
              <ol className="steps-list"><li><span>01</span>{t.step1}</li><li><span>02</span>{t.step2}</li><li><span>03</span>{t.step3}</li></ol>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
