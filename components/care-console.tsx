"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CoverageMap, type CoverageCase } from "@/components/coverage-map";
import { AuthPanel, type AuthenticatedAppUser } from "@/components/auth-panel";
import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { getDemoUserForRole, type PortalRole } from "@/lib/demo-auth";
import { type IntakeCaseDraft } from "@/lib/intake";
import {
  demoScenarios,
  demoSegments,
  illustrativeBenchmarks,
  seededAudit,
  seededRoster,
  seededTasks,
  type DemoScenario,
} from "@/lib/demo-data";
import { applySeverityPolicy, assessDemoTranscript } from "@/lib/triage";
import { PatientPortal } from "@/components/patient-portal";
import type { PersistedCaseDetail, PersistedCaseRecord } from "@/lib/persistence-contract";
import { Room, RoomEvent, createLocalAudioTrack, type LocalAudioTrack } from "livekit-client";
import { SimulatedTranscriptionProvider, type TranscriptionSession } from "@/lib/transcription-provider";
import type {
  Assessment,
  AuditEvent,
  BenchmarkRun,
  CareTask,
  ClinicalDecision,
  Priority,
  StaffMember,
  TranscriptSegment,
  TriageResult,
} from "@/lib/types";

type View = "intake" | "review" | "roster" | "benchmark";
type CallState = "ready" | "live" | "stopped" | "error";

const priorityCopy: Record<Priority, { label: string; tone: string }> = {
  immediate_clinician_review: { label: "Immediate clinician review", tone: "critical" },
  urgent_review: { label: "Urgent review", tone: "urgent" },
  same_day_queue: { label: "Same-day queue", tone: "same-day" },
  routine_queue: { label: "Routine queue", tone: "routine" },
  insufficient_information: { label: "Information needed", tone: "unknown" },
};

const navItems: Array<{ id: View; eyebrow: string; title: string }> = [
  { id: "intake", eyebrow: "01", title: "Live intake" },
  { id: "review", eyebrow: "02", title: "Clinician review" },
  { id: "roster", eyebrow: "03", title: "Coverage & tasks" },
  { id: "benchmark", eyebrow: "04", title: "Provider benchmark" },
];

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function cycleStaffStatus(status: StaffMember["status"]): StaffMember["status"] {
  const statuses: StaffMember["status"][] = ["available", "engaged", "unavailable"];
  return statuses[(statuses.indexOf(status) + 1) % statuses.length];
}

function safeStorageGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = window.localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function CareConsole() {
  const [role, setRole] = useState<PortalRole>("clinician");
  const [authenticated, setAuthenticated] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("Dr. Anjana R.");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [isSavingDecision, setIsSavingDecision] = useState(false);
  const [view, setView] = useState<View>("intake");
  const [caseAlias, setCaseAlias] = useState("Demo case #24");
  const [callerRelationship, setCallerRelationship] = useState("Caregiver");
  const [callback, setCallback] = useState("+91 ••••• 4821");
  const [hasCallConsent, setHasCallConsent] = useState(false);
  const [hasRecordingConsent, setHasRecordingConsent] = useState(false);
  const [callState, setCallState] = useState<CallState>("ready");
  const [secondsLive, setSecondsLive] = useState(0);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [manualText, setManualText] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [alerted, setAlerted] = useState(false);
  const [decision, setDecision] = useState<ClinicalDecision | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [providerMessage, setProviderMessage] = useState("Simulation only — no audio is transmitted.");
  const [callTransport, setCallTransport] = useState<"simulation" | "livekit">("simulation");
  const [isAssessing, setIsAssessing] = useState(false);
  const [roster, setRoster] = useState<StaffMember[]>(seededRoster);
  const [tasks, setTasks] = useState<CareTask[]>(seededTasks);
  const [reviewQueue, setReviewQueue] = useState<PersistedCaseRecord[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [audit, setAudit] = useState<AuditEvent[]>(seededAudit);
  const [selectedProvider, setSelectedProvider] = useState<BenchmarkRun["provider"]>("OpenAI live transcription");
  const mediaStream = useRef<MediaStream | null>(null);
  const simulationSession = useRef<TranscriptionSession | null>(null);
  const liveKitRoom = useRef<Room | null>(null);
  const liveKitAudioTrack = useRef<LocalAudioTrack | null>(null);
  const remoteAudioElements = useRef<Set<HTMLElement>>(new Set());
  const segmentsRef = useRef<TranscriptSegment[]>([]);

  const [isOfflineSimulated, setIsOfflineSimulated] = useState(false);
  const [operationsTab, setOperationsTab] = useState<"map_coverage" | "nurse_visits">("map_coverage");
  const [selectedNurseFilter, setSelectedNurseFilter] = useState("Nurse Fathima K.");
  const [caregiverNotification, setCaregiverNotification] = useState<{
    open: boolean;
    caseAlias: string;
    nurseName: string;
    priority: Priority;
    phone: string;
  } | null>(null);
  useEffect(() => {
    setRoster(safeStorageGet("24-care-demo-roster", seededRoster));
    setTasks(safeStorageGet("24-care-demo-tasks", seededTasks));
    setAudit(safeStorageGet("24-care-demo-audit", seededAudit));
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        const authResponse = await fetch("/api/auth/session");
        const authPayload = (await authResponse.json()) as { user?: { name: string; role: AuthenticatedAppUser["role"] } | null };
        if (authPayload.user) {
          setAuthenticated(true);
          setCurrentUserName(authPayload.user.name);
          setRole(authPayload.user.role === "patient" || authPayload.user.role === "caretaker" ? authPayload.user.role : "clinician");
          return;
        }

        const demoResponse = await fetch("/api/session");
        const demoPayload = (await demoResponse.json()) as { user?: { name: string; role: PortalRole } };
        if (demoPayload.user) {
          setRole(demoPayload.user.role);
          setCurrentUserName(demoPayload.user.name);
        }
      } catch {
        // Demo mode remains available when Supabase is not configured.
      }
    })();
  }, []);
  useEffect(() => {
    if (!authenticated || role !== "clinician") {
      setReviewQueue([]);
      return;
    }

    let cancelled = false;
    setIsLoadingQueue(true);
    void fetch("/api/cases")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { cases?: PersistedCaseRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load the care queue.");
        if (!cancelled) setReviewQueue(payload.cases ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) setProviderMessage(error instanceof Error ? error.message : "Unable to load the care queue.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingQueue(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, role]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("24-care-demo-roster", JSON.stringify(roster));
    window.localStorage.setItem("24-care-demo-tasks", JSON.stringify(tasks));
    window.localStorage.setItem("24-care-demo-audit", JSON.stringify(audit));
  }, [audit, roster, tasks]);

  useEffect(() => {
    if (callState !== "live") return;
    const interval = window.setInterval(() => setSecondsLive((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [callState]);

  useEffect(() => {
    return () => {
      mediaStream.current?.getTracks().forEach((track) => track.stop());
      void simulationSession.current?.stop();
    };
  }, []);

  const transcript = useMemo(
    () => segments.filter((segment) => segment.status === "final").map((segment) => segment.text).join(" "),
    [segments],
  );

  const activeBenchmark = illustrativeBenchmarks.find((benchmark) => benchmark.provider === selectedProvider)!;
  const availableCareStaff = roster.filter(
    (member) => member.status === "available" && member.role !== "Duty clinician",
  );
  const coverageCases = useMemo<CoverageCase[]>(() => {
    const locations = [
      { locality: "North zone", x: 29, y: 24, etaMinutes: 18 },
      { locality: "City zone", x: 68, y: 23, etaMinutes: 12 },
      { locality: "Outer zone", x: 77, y: 61, etaMinutes: 27 },
      { locality: "South zone", x: 24, y: 65, etaMinutes: 22 },
      { locality: "East zone", x: 84, y: 39, etaMinutes: 16 },
    ];
    const sourceCases = [
      ...tasks.map((task) => ({
        id: task.id,
        caseAlias: task.caseAlias,
        priority: task.priority,
        assignee: task.assignee,
        status: task.state,
      })),
      ...reviewQueue.map((item) => ({
        id: item.id,
        caseAlias: item.case_alias,
        priority: item.priority,
        assignee: null,
        status: "awaiting_review",
      })),
    ];

    return sourceCases.map((item, index) => ({
      ...item,
      ...locations[index % locations.length],
    }));
  }, [reviewQueue, tasks]);


  function addAudit(actor: string, action: string, detail: string) {
    setAudit((current) => [
      { id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, detail },
      ...current,
    ]);
  }
  function handleAuthenticated(user: AuthenticatedAppUser) {
    setAuthenticated(true);
    setAuthOpen(false);
    setCurrentUserName(user.name);
    setRole(user.role === "patient" || user.role === "caretaker" ? user.role : "clinician");
  }

  async function changeRole(nextRole: PortalRole) {
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) throw new Error("Role session unavailable");
      const payload = (await response.json()) as { user: { name: string; role: PortalRole } };
      setRole(payload.user.role);
      setCurrentUserName(payload.user.name);
    } catch {
      const localUser = getDemoUserForRole(nextRole);
      setRole(localUser.role);
      setCurrentUserName(localUser.name);
    }
  }

  function receivePatientCase(draft: IntakeCaseDraft) {
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(),
      text: draft.transcript,
      status: "final",
      language: "mixed",
      createdAt: new Date().toISOString(),
    };
    segmentsRef.current = [segment];
    setSegments([segment]);
    setCaseAlias(draft.caseAlias);
    setCallerRelationship(draft.relationship);
    setCallback(draft.callback);
    setAssessment(draft.assessment);
    setTriage(draft.triage);
    setCaseId(draft.persistedCaseId ?? null);
    setAlerted(false);
    setDecision(null);
    setDecisionNote("");
    setCallState("stopped");
    setView("review");
    addAudit("Patient portal", "Submitted intake", `${draft.caseAlias} entered the clinician review queue.`);
  }
  async function openPersistedCase(id: string) {
    setProviderMessage("Loading persisted case…");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(id)}`);
      const payload = (await response.json().catch(() => ({}))) as PersistedCaseDetail & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load the care case.");

      segmentsRef.current = payload.transcriptSegments;
      setSegments(payload.transcriptSegments);
      setCaseId(payload.case.id);
      setCaseAlias(payload.case.case_alias);
      setCallerRelationship(payload.case.caller_relationship);
      setCallback(payload.case.callback_reference);
      setAssessment(payload.assessment);
      setTriage(payload.case.triage_output);
      setAlerted(true);
      setDecision(null);
      setDecisionNote("");
      setCallState("stopped");
      setView("review");
      setProviderMessage("Persisted case loaded.");
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to load the care case.");
    }
  }

  async function runAssessment(nextTranscript: string) {
    if (!nextTranscript.trim()) return;
    setIsAssessing(true);
    try {
      const response = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: nextTranscript, caseId: authenticated ? caseId : undefined }),
      });
      if (!response.ok) throw new Error("Assessment service unavailable");
      const output = (await response.json()) as { assessment: Assessment; triage: TriageResult };
      setAssessment(output.assessment);
      setTriage(output.triage);
    } catch {
      const localAssessment = assessDemoTranscript(nextTranscript, demoClinicalPolicy);
      setAssessment(localAssessment);
      setTriage(applySeverityPolicy(localAssessment, demoClinicalPolicy));
      setProviderMessage("Assessment endpoint unavailable — using local demo policy.");
    } finally {
      setIsAssessing(false);
    }
  }

  async function persistTranscriptSegment(segment: TranscriptSegment) {
    if (!authenticated || !caseId) return;
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: segment.text, language: segment.language, status: segment.status, speaker: segment.speaker ?? "caller" }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to persist transcript segment.");
      }
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to persist transcript segment.");
    }
  }

  function addSegments(incoming: TranscriptSegment[]) {
    const updated = [...segmentsRef.current, ...incoming];
    segmentsRef.current = updated;
    setSegments(updated);
    incoming.forEach((segment) => void persistTranscriptSegment(segment));
    const updatedTranscript = updated
      .filter((item) => item.status === "final")
      .map((item) => item.text)
      .join(" ");
    void runAssessment(updatedTranscript);
  }

  async function startLiveKitSession(): Promise<TranscriptionSession> {
    const response = await fetch("/api/calls/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: true, caseId }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string; token?: string; url?: string };
    if (!response.ok || !payload.token || !payload.url) {
      throw new Error(payload.error ?? "LiveKit call session could not be created.");
    }

    const room = new Room();
    await room.connect(payload.url, payload.token, { autoSubscribe: true });
    room.registerTextStreamHandler("lk.transcription", (reader, participantInfo) => {
      void (async () => {
        const text = (await reader.readAll()).trim();
        if (!text) return;
        addSegment({
          id: crypto.randomUUID(),
          text,
          status: "final",
          language: "mixed",
          speaker: participantInfo.identity === "24-care-intake" ? "assistant" : "caller",
          createdAt: new Date().toISOString(),
        });
      })().catch((error: unknown) => {
        setProviderMessage(error instanceof Error ? error.message : "The LiveKit transcript stream failed.");
      });
    });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== "audio") return;
      const element = track.attach();
      element.autoplay = true;
      element.setAttribute("aria-hidden", "true");
      element.style.display = "none";
      document.body.appendChild(element);
      remoteAudioElements.current.add(element);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => {
        remoteAudioElements.current.delete(element);
        element.remove();
      });
    });
    const audioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    await room.localParticipant.publishTrack(audioTrack);
    liveKitRoom.current = room;
    liveKitAudioTrack.current = audioTrack;
    setCallTransport("livekit");
    setProviderMessage("Secure LiveKit audio is connected. Transcript capture requires the configured server-side agent.");

    return {
      stop: async () => {
        audioTrack.stop();
        remoteAudioElements.current.forEach((element) => element.remove());
        remoteAudioElements.current.clear();
        room.disconnect();
        liveKitAudioTrack.current = null;
        liveKitRoom.current = null;
        setCallTransport("simulation");
      },
    };
  }

  function addSegment(segment: TranscriptSegment) {
    addSegments([segment]);
  }

  async function startIntake() {
    if (!hasCallConsent) return;
    setCallState("live");
    setSecondsLive(0);

    if (authenticated) {
      try {
        simulationSession.current = await startLiveKitSession();
        addAudit("Call handler", "Started LiveKit intake", `${caseAlias} joined a consented secure audio room.`);
      } catch (error) {
        setCallState("error");
        setProviderMessage(error instanceof Error ? error.message : "The LiveKit call could not be started.");
      }
      return;
    }

    setCallTransport("simulation");
    setProviderMessage("Requesting browser microphone. Demo mode keeps audio local.");
    try {
      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      setProviderMessage("Browser microphone is active. Demo transcription is local; no audio is transmitted.");
    } catch {
      setProviderMessage("Microphone permission was not granted. Continue with the safe typed/simulated intake path.");
    }

    const provider = new SimulatedTranscriptionProvider();
    simulationSession.current = await provider.start({
      onSegment: addSegment,
      onStatus: (status) => {
        if (status === "error") setCallState("error");
      },
    });
    addAudit("Call handler", "Started consented intake", `${caseAlias} entered demo live-intake mode.`);
  }

  async function stopIntake() {
    await simulationSession.current?.stop();
    simulationSession.current = null;
    mediaStream.current?.getTracks().forEach((track) => track.stop());
    setCallTransport("simulation");
    mediaStream.current = null;
    setCallState("stopped");
    setProviderMessage("Intake stopped. Raw audio is not stored because no IPM retention policy is configured.");
    addAudit("Call handler", "Stopped intake", `${caseAlias} transcript is ready for clinician review.`);
  }

  function addFullDemoScenario() {
    const existing = new Set(segmentsRef.current.map((segment) => segment.id));
    addSegments(demoSegments.filter((segment) => !existing.has(segment.id)));
    setProviderMessage("Added two fictional Malayalam/English transcript turns for the demo.");
  }

  function addManualTurn() {
    if (!manualText.trim()) return;
    addSegment({
      id: crypto.randomUUID(),
      text: manualText.trim(),
      status: "final",
      language: "mixed",
      createdAt: new Date().toISOString(),
    });
    setManualText("");
  }

  function notifyClinician() {
    if (!triage) return;
    setAlerted(true);
    setView("review");
    addAudit("System", "Alerted duty clinician", `${triage.ruleTitle} prepared for review. No care action was sent.`);
  }

  function createDraftTask(outcome: ClinicalDecision["outcome"], note: string) {
    if (!triage) return;
    const assignee = availableCareStaff[0]?.name ?? null;
    const task: CareTask = {
      id: crypto.randomUUID(),
      caseAlias,
      priority: triage.priority,
      assignee,
      action: outcome === "overridden" ? `Clinician override: ${note || "Review recorded."}` : triage.action,
      state: assignee ? "assigned" : triage.priority === "urgent_review" || triage.priority === "immediate_clinician_review" ? "unassigned_urgent" : "awaiting_clinician",
      createdAt: new Date().toISOString(),
    };
    setTasks((current) => [task, ...current]);
  }

  function loadDemoScenario(scenario: DemoScenario) {
    setCaseAlias(scenario.alias);
    setCallerRelationship(scenario.relationship);
    setHasCallConsent(true);
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(),
      text: scenario.transcript,
      status: "final",
      language: "mixed",
      createdAt: new Date().toISOString(),
    };
    addSegments([segment]);
    setProviderMessage(`Loaded: ${scenario.title} (${scenario.priorityNote})`);
    addAudit("Duty clinician", "Loaded demo scenario", `${scenario.title} (${scenario.alias})`);
  }

  function handleAssignNurseFromMap(caseId: string, nurseName: string | null) {
    setTasks((current) =>
      current.map((t) => (t.id === caseId ? { ...t, assignee: nurseName, state: nurseName ? "assigned" : "unassigned_urgent" } : t))
    );
    const targetTask = tasks.find((t) => t.id === caseId);
    const alias = targetTask?.caseAlias ?? "Case";
    addAudit(
      "Duty clinician",
      nurseName ? "Assigned field nurse" : "Unassigned field nurse",
      `${alias} ${nurseName ? `assigned to ${nurseName} for field visit` : "returned to unassigned queue"}.`
    );
    if (nurseName) {
      setCaregiverNotification({
        open: true,
        caseAlias: alias,
        nurseName,
        priority: targetTask?.priority ?? "urgent_review",
        phone: callback,
      });
    }
  }

  function updateTaskVisitState(taskId: string, state: CareTask["state"]) {
    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, state } : t)));
    const target = tasks.find((t) => t.id === taskId);
    addAudit("Field nurse", "Updated visit state", `${target?.caseAlias ?? "Case"}: ${state}`);
  }

  async function recordDecision(outcome: ClinicalDecision["outcome"]) {
    if (!triage || decision || isSavingDecision) return;
    const note = decisionNote.trim() || (outcome === "confirmed" ? "Reviewed against current policy." : "Override recorded.");

    if (authenticated && caseId) {
      setIsSavingDecision(true);
      try {
        const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome, note }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "The clinical decision could not be saved.");
      } catch (error) {
        setProviderMessage(error instanceof Error ? error.message : "The clinical decision could not be saved.");
        setIsSavingDecision(false);
        return;
      }
      setIsSavingDecision(false);
      setReviewQueue((current) => current.filter((item) => item.id !== caseId));
    }

    const nextDecision: ClinicalDecision = {
      outcome,
      note,
      decidedBy: authenticated ? currentUserName : "Dr. Anjana R. (demo)",
      decidedAt: new Date().toISOString(),
    };
    setDecision(nextDecision);
    createDraftTask(outcome, note);
    addAudit("Duty clinician", outcome === "confirmed" ? "Confirmed proposed action" : "Overrode proposed action", note);
  }

  function updateRosterStatus(id: string) {
    setRoster((current) =>
      current.map((member) => (member.id === id ? { ...member, status: cycleStaffStatus(member.status) } : member)),
    );
    const member = roster.find((item) => item.id === id);
    if (member) addAudit("Care coordinator", "Updated availability", `${member.name}: ${cycleStaffStatus(member.status)}.`);
  }

  function resetDemo() {
    void stopIntake();
    segmentsRef.current = [];
    setSegments([]);
    setAssessment(null);
    setTriage(null);
    setAlerted(false);
    setCaseId(null);
    setDecision(null);
    setDecisionNote("");
    setHasCallConsent(false);
    setHasRecordingConsent(false);
    setCallState("ready");
    setSecondsLive(0);
    setProviderMessage("Simulation only — no audio is transmitted.");
  }

  const currentPriority = triage ? priorityCopy[triage.priority] : priorityCopy.insufficient_information;

  if (role !== "clinician") {
    return (
      <PatientPortal
        role={role}
        userName={currentUserName}
        authenticated={authenticated}
        onRoleChange={changeRole}
        onAuthenticated={handleAuthenticated}
        onCaseCreated={receivePatientCase}
        onOpenAuth={() => setAuthOpen(true)}
        authOpen={authOpen}
        onCloseAuth={() => setAuthOpen(false)}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Care workspace navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span className="brand-mark-symbol">24</span>
          </div>
          <div className="brand-text">
            <p className="eyebrow">IPM Palliative Care</p>
            <p className="brand-title">Triage Desk</p>
          </div>
        </div>

        <nav className="nav-list" aria-label="Workspace sections">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "is-active" : ""}`}
              onClick={(event) => {
                setView(item.id);
                event.currentTarget.scrollIntoView({
                  behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                  block: "nearest",
                  inline: "center",
                });
              }}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span className="nav-item-eyebrow">{item.eyebrow}</span>
              <span className="nav-item-label">{item.title}</span>
              {item.id === "review" && (alerted || reviewQueue.length > 0) ? (
                <span className="nav-item-counter nav-item-counter--alert">{reviewQueue.length || 1}</span>
              ) : item.id === "roster" && tasks.length > 0 ? (
                <span className="nav-item-counter">{tasks.length}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footnote">
          <div className="sidebar-hub-status">
            <span className="status-dot status-dot--safe" />
            <span>Calicut Central Hub</span>
          </div>
          <p className="sidebar-hub-sub">Active Shift · 19:00–07:00 IST</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title-group">
            <div className="topbar-breadcrumb">
              <span className="breadcrumb-root">IPM Desk</span>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{navItems.find((item) => item.id === view)?.title}</span>
            </div>
            <div className="topbar-heading-row">
              <h1>{navItems.find((item) => item.id === view)?.title}</h1>
              <span className="topbar-live-tag">Operational</span>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              className={`network-chip ${isOfflineSimulated ? "network-chip--offline" : "network-chip--online"}`}
              type="button"
              onClick={() => setIsOfflineSimulated((c) => !c)}
              title="Click to toggle offline resilience simulation"
              aria-pressed={isOfflineSimulated}
            >
              <span className="network-dot" aria-hidden="true" />
              {isOfflineSimulated ? "Offline Queue Active" : "Synced to Cloud"}
            </button>
            <div className="topbar-role-selector">
              <span className="topbar-role-label">Role:</span>
              <select value={role} onChange={(event) => void changeRole(event.target.value as PortalRole)} aria-label="Active system role">
                <option value="clinician">Clinician</option>
                <option value="patient">Patient</option>
                <option value="caretaker">Caretaker</option>
              </select>
            </div>
            <div className="topbar-divider" aria-hidden="true" />
            <button className="topbar-btn" type="button" onClick={() => setAuthOpen(true)}>{authenticated ? "Live account" : "Sign in"}</button>
            <button className="topbar-btn topbar-btn--muted" type="button" onClick={resetDemo}>Reset demo</button>
            <div className="user-profile-badge" title={`Signed in as ${currentUserName}`}>
              <span className="user-chip">{currentUserName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>
              <span className="user-profile-name">{currentUserName.startsWith("Dr.") ? currentUserName.split(" ").slice(0, 2).join(" ") : currentUserName.split(" ")[0]}</span>
            </div>
          </div>
        </header>

        <div className="policy-notice" role="note">
          <div className="policy-notice-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm1 8H7v-5h2v5z" />
            </svg>
          </div>
          <p><strong>Clinical Decision Support Advisory.</strong> This workspace uses rule-based clinical safety signals to assist duty clinicians. Final triage classification, prescription, and field dispatch require clinician sign-off.</p>
        </div>
        {authOpen ? <AuthPanel onAuthenticated={handleAuthenticated} onClose={() => setAuthOpen(false)} /> : null}
        {caregiverNotification?.open ? (
          <div className="notification-modal-shell" role="dialog" aria-modal="true" aria-labelledby="notif-dialog-title">
            <div className="notification-modal-card">
              <div className="notif-modal-header">
                <div>
                  <p className="eyebrow">Real-time dispatch simulation</p>
                  <h2 id="notif-dialog-title">Caregiver WhatsApp & SMS alert</h2>
                </div>
                <button type="button" className="text-button" onClick={() => setCaregiverNotification(null)}>✕</button>
              </div>
              <div className="notif-preview-box">
                <div className="notif-channel-tag">📲 WhatsApp to {caregiverNotification.phone}</div>
                <p className="notif-bubble">
                  {`Namaskaram. IPM Palliative Care has reviewed your request for ${caregiverNotification.caseAlias}.\n\n`}
                  {`👩⚕️ Nurse ${caregiverNotification.nurseName} has been assigned for a home visit (${priorityCopy[caregiverNotification.priority].label}).\n`}
                  {`⏱️ Estimated arrival: ~20 mins.\n`}
                  {`📞 Please keep this phone reachable.\n\n`}
                  {`_For immediate life-threatening emergency, please dial 108._`}
                </p>
              </div>
              <div className="notif-modal-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    addAudit("System dispatch", "Dispatched caregiver WhatsApp alert", `Simulated WhatsApp sent to ${caregiverNotification.phone} (${caregiverNotification.caseAlias})`);
                    setCaregiverNotification(null);
                  }}
                >
                  Confirm & simulate send
                </button>
                <button type="button" className="secondary-button" onClick={() => setCaregiverNotification(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {view === "intake" && (
          <section className="intake-layout" aria-label="Live call intake">
            <div className="intake-main">
              <section className="panel case-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Intake record</p>
                    <h2>Caller details</h2>
                  </div>
                  <span className={`call-chip call-chip--${callState}`}>{callState === "live" ? `Live · ${formatClock(secondsLive)}` : callState}</span>
                </div>
                <div className="clinical-scenarios-bar" role="group" aria-label="Pre-loaded clinical test cases">
                  <div className="scenarios-bar-header">
                    <span className="scenarios-bar-title">Clinical sample scenarios</span>
                    <span className="scenarios-bar-hint">Select a validated patient intake to evaluate policy rules:</span>
                  </div>
                  <div className="scenarios-bar-chips">
                    {demoScenarios.map((scenario) => (
                      <button
                        key={scenario.id}
                        type="button"
                        className="scenario-pill-btn"
                        onClick={() => loadDemoScenario(scenario)}
                        title={scenario.priorityNote}
                      >
                        <span className="pill-badge">{scenario.id === "severe-pain" ? "Acute" : scenario.id === "catheter-block" ? "Urgent" : "Routine"}</span>
                        <span className="pill-name">{scenario.title}</span>
                        <span className="pill-lang-tag">മലയാളം</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field-grid">
                  <label>
                    <span className="field-label">Case alias / identifier</span>
                    <input value={caseAlias} onChange={(event) => setCaseAlias(event.target.value)} />
                  </label>
                  <label>
                    <span className="field-label">Caller relationship</span>
                    <select value={callerRelationship} onChange={(event) => setCallerRelationship(event.target.value)}>
                      <option>Caregiver</option>
                      <option>Patient</option>
                      <option>Family member</option>
                      <option>Volunteer</option>
                    </select>
                  </label>
                  <label>
                    <span className="field-label">Callback telephone</span>
                    <input value={callback} onChange={(event) => setCallback(event.target.value)} />
                  </label>
                </div>
                <div className="consent-box">
                  <label className="check-row">
                    <input type="checkbox" checked={hasCallConsent} onChange={(event) => setHasCallConsent(event.target.checked)} />
                    <span>I confirm verbal call consent for real-time AI transcription in accordance with IPM care protocol.</span>
                  </label>
                  <label className="check-row">
                    <input type="checkbox" checked={hasRecordingConsent} onChange={(event) => setHasRecordingConsent(event.target.checked)} />
                    <span>Caller opted into encrypted audio archiving (requires IPM retention policy approval).</span>
                  </label>
                </div>
                <div className="call-controls">
                  {callState !== "live" ? (
                    <button className="primary-action-btn" onClick={startIntake} disabled={!hasCallConsent}>
                      <span className="btn-icon">🎙️</span> Start Live Intake
                    </button>
                  ) : (
                    <button className="danger-button" onClick={() => void stopIntake()}>Stop Session</button>
                  )}
                  <button className="secondary-action-btn" onClick={addFullDemoScenario} disabled={!hasCallConsent}>
                    + Append Evidence Turns
                  </button>
                  <div className="transport-badge">
                    <span className="transport-dot" aria-hidden="true" />
                    <span>{callTransport === "livekit" ? "LiveKit Audio" : "Local Audio Simulation"}</span>
                  </div>
                  <span className="provider-state" aria-live="polite">{providerMessage}</span>
                </div>
              </section>

              <section className="panel transcript-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">AI-generated transcript</p>
                    <h2>Call evidence</h2>
                  </div>
                  <span className="language-chip">Malayalam + English</span>
                </div>
                <div className="transcript-feed" aria-live="polite" aria-label="Transcript updates">
                  {segments.length === 0 ? (
                    <div className="empty-transcript">
                      <span aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M3 12h2m3-5v10m4-13v16m4-11v6m4-3h2" />
                        </svg>
                      </span>
                      <p>Start a consented intake, add fictional demo turns, or enter a typed update below.</p>
                    </div>
                  ) : (
                    segments.map((segment) => (
                      <article className="transcript-row" key={segment.id}>
                        <div><span className="segment-status">{segment.status}</span><time>{formatTime(segment.createdAt)}</time></div>
                        <p>{segment.text}</p>
                      </article>
                    ))
                  )}
                </div>
                <div className="manual-turn">
                  <label className="sr-only" htmlFor="manual-note">Add a typed call update</label>
                  <input
                    id="manual-note"
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                    placeholder="Add a typed caller update when audio is unavailable…"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addManualTurn();
                    }}
                  />
                  <button className="secondary-button" onClick={addManualTurn} disabled={!manualText.trim()}>Analyse update</button>
                </div>
              </section>
            </div>

            <aside className="analysis-rail" aria-label="Suggested severity analysis">
              <section className="analysis-card cds-card">
                <div className="cds-card-header">
                  <div>
                    <p className="eyebrow">Decision Support</p>
                    <h2>Policy Assessment</h2>
                  </div>
                  <span className="cds-version-badge">v0.1 · IPM Ruleset</span>
                </div>

                {!triage ? (
                  <div className="cds-pending-banner">
                    <span className="cds-pending-dot" aria-hidden="true" />
                    <div>
                      <strong>Awaiting Evidence</strong>
                      <p>Add transcript turns or select a clinical case to evaluate urgency.</p>
                    </div>
                  </div>
                ) : (
                  <div className={`priority-banner priority-banner--${currentPriority.tone}`}>
                    <span className="priority-kicker">Recommended Priority</span>
                    <strong>{currentPriority.label}</strong>
                    <span className="priority-rule-id">Matched Rule: {triage.ruleId}</span>
                  </div>
                )}

                {isAssessing ? <p className="quiet-loading">Evaluating clinical ruleset…</p> : null}

                <dl className="analysis-details">
                  <div>
                    <dt>Guidance action</dt>
                    <dd>{triage?.action ?? "Capture caller concern to formulate triage action."}</dd>
                  </div>
                  <div>
                    <dt>Routing destination</dt>
                    <dd>{triage?.destinationType ?? "Duty clinician review queue"}</dd>
                  </div>
                  <div>
                    <dt>Algorithm uncertainty</dt>
                    <dd>
                      <div className="uncertainty-indicator">
                        <span className={`uncertainty-tag uncertainty-tag--${assessment?.uncertainty ?? "high"}`}>
                          {assessment?.uncertainty ?? "High"}
                        </span>
                        <div className="uncertainty-meter" aria-hidden="true">
                          <span className={`meter-bar ${(assessment?.uncertainty ?? "high") === "high" ? "is-filled" : ""}`} />
                          <span className={`meter-bar ${(assessment?.uncertainty ?? "high") === "moderate" || (assessment?.uncertainty ?? "high") === "high" ? "is-filled" : ""}`} />
                          <span className="meter-bar" />
                        </div>
                      </div>
                    </dd>
                  </div>
                </dl>

                <button className="primary-action-btn full-width" onClick={notifyClinician} disabled={!triage || alerted}>
                  {alerted ? "✓ Duty Clinician Alerted" : "Prepare Clinician Alert →"}
                </button>
                <p className="microcopy">Training sandbox mode: creates reviewable draft without external dispatch.</p>
              </section>

              <section className="analysis-card compact-card cds-evidence-card">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">Matched signals</p>
                    <h2>Rule rationale</h2>
                  </div>
                  <span className="rule-id">{triage?.ruleId ?? "awaiting-evidence"}</span>
                </div>
                {triage?.matchedSignals.length ? (
                  <ul className="evidence-list">
                    {triage.matchedSignals.map((signal) => (
                      <li key={signal.signalId}>
                        <strong className="signal-label">{signal.label}</strong>
                        <span className="signal-quote">“{signal.excerpts.join("” · “")}”</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No fictional policy signals detected yet. Triage remains unclassified until symptoms or concerns are provided.</p>
                )}
              </section>
            </aside>
          </section>
        )}

        {view === "review" && (
          <section className="review-layout" aria-label="Duty clinician review">
            <div className="review-main">
              <section className="panel review-header">
                <div>
                  <p className="eyebrow">Duty clinician workspace</p>
                  <h2>{caseAlias}</h2>
                  <p className="subtle">Submitted by call handler · {callerRelationship} · {callback}</p>
                </div>
                <div className="review-status">
                  <span className={`priority-pill priority-pill--${currentPriority.tone}`}>{currentPriority.label}</span>
                  <span className="confirmation-label">Human confirmation required</span>
                </div>
              </section>

              <section className="panel review-evidence">
                <div className="panel-heading"><div><p className="eyebrow">Review before action</p><h2>Evidence and policy trace</h2></div><span className="demo-badge">No action sent</span></div>
                <div className="review-grid">
                  <div>
                    <h3>Call evidence</h3>
                    <p className="evidence-quote">{transcript || "No final transcript is available yet."}</p>
                  </div>
                  <div>
                    <h3>Policy evaluation</h3>
                    <dl className="review-dl">
                      <div><dt>Rule</dt><dd>{triage?.ruleTitle ?? "Insufficient information"}</dd></div>
                      <div><dt>Policy version</dt><dd>{triage?.policyVersion ?? demoClinicalPolicy.version}</dd></div>
                      <div><dt>Model output</dt><dd>{assessment?.provider ?? "Awaiting transcript"}</dd></div>
                    </dl>
                  </div>
                </div>
                <div className="followup-box">
                  <h3>Required follow-up before confirmation</h3>
                  <ul>
                    {(triage?.requiredFollowUps ?? ["Obtain a transcripted concern and a callback number."]).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </section>

              <section className="panel decision-panel">
                <p className="eyebrow">Clinical decision</p>
                <h2>Confirm or override the prepared draft</h2>
                <label>
                  Clinician note / override reason
                  <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Record why the proposed action is confirmed or changed…" rows={3} />
                </label>
                <div className="decision-actions">
                  <button className="primary-button" disabled={!triage || Boolean(decision) || isSavingDecision} onClick={() => void recordDecision("confirmed")}>{isSavingDecision ? "Saving…" : "Confirm prepared action"}</button>
                  <button className="secondary-button" disabled={!triage || Boolean(decision) || isSavingDecision} onClick={() => void recordDecision("overridden")}>Record override</button>
                </div>
                {decision ? (
                  <div className="decision-confirmation" role="status">
                    <strong>{decision.outcome === "confirmed" ? "Prepared action confirmed" : "Override recorded"}</strong>
                    <span>{decision.decidedBy} · {formatTime(decision.decidedAt)} · A task was created; no external dispatch occurred.</span>
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="review-side">
              <section className="panel compact-card">
                <p className="eyebrow">Alert status</p>
                <h2>{alerted ? "Duty clinician notified" : "Review draft waiting"}</h2>
                <p className="subtle">The alert contains the policy evidence and does not expose the case to unauthorised roles.</p>
              </section>
              <section className="panel compact-card">
                <p className="eyebrow">Recording</p>
                <h2>Not retained</h2>
                <p className="subtle">{hasRecordingConsent ? "Consent was recorded, but no IPM retention policy is configured." : "Recording consent was not collected."}</p>
              </section>
            </aside>
          </section>
        )}

        {view === "roster" && (
          <section className="operations-layout" aria-label="Coverage and task coordination">
            <div className="operations-main">
              <div className="operations-subtabs" role="tablist" aria-label="Operations views">
                <button
                  role="tab"
                  type="button"
                  className={`operations-tab-btn ${operationsTab === "map_coverage" ? "is-active" : ""}`}
                  aria-selected={operationsTab === "map_coverage"}
                  onClick={() => setOperationsTab("map_coverage")}
                >
                  🗺️ Case map & duty coverage
                </button>
                <button
                  role="tab"
                  type="button"
                  className={`operations-tab-btn ${operationsTab === "nurse_visits" ? "is-active" : ""}`}
                  aria-selected={operationsTab === "nurse_visits"}
                  onClick={() => setOperationsTab("nurse_visits")}
                >
                  👩⚕️ Nurse field view (My visits today)
                </button>
              </div>

              {operationsTab === "map_coverage" ? (
                <>
                  <CoverageMap cases={coverageCases} staff={roster} onAssignNurse={handleAssignNurseFromMap} />
                  <section className="panel">
                <div className="panel-heading"><div><p className="eyebrow">Manual availability</p><h2>Duty coverage</h2></div><span className="quiet-badge">Coordinator controlled</span></div>
                <div className="roster-list">
                  {roster.map((member) => (
                    <article className="roster-row" key={member.id}>
                      <div className="avatar" aria-hidden="true">{member.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
                      <div className="member-info"><strong>{member.name}</strong><span>{member.role} · {member.serviceArea}</span><small>{member.shift} · {member.contactMethod}</small></div>
                      <button className={`availability availability--${member.status}`} onClick={() => updateRosterStatus(member.id)} aria-label={`Change ${member.name} status from ${member.status}`}>
                        {member.status}
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading"><div><p className="eyebrow">Supabase-backed review queue</p><h2>Cases awaiting review</h2></div><span className="quiet-badge">{isLoadingQueue ? "Loading…" : reviewQueue.length}</span></div>
                {reviewQueue.length ? (
                  <div className="roster-list">
                    {reviewQueue.map((item) => (
                      <article className="roster-row" key={item.id}>
                        <div className="member-info"><strong>{item.case_alias}</strong><span>{priorityCopy[item.priority].label} · {item.caller_relationship}</span><small>{item.callback_reference} · {formatTime(item.created_at)}</small></div>
                        <button className="secondary-button" type="button" onClick={() => void openPersistedCase(item.id)}>Review case</button>
                      </article>
                    ))}
                  </div>
                ) : <p className="empty-copy">{isLoadingQueue ? "Loading authenticated cases…" : "No persisted cases are waiting for clinician review."}</p>}
              </section>
              <section className="panel task-panel">
                <div className="panel-heading"><div><p className="eyebrow">Clinician-confirmed work</p><h2>Care task queue</h2></div><span className="quiet-badge">{tasks.length} open</span></div>
                <div className="task-table" role="table" aria-label="Care task queue">
                  <div className="task-head" role="row"><span>Case</span><span>Priority</span><span>Prepared action</span><span>Assignment</span></div>
                  {tasks.map((task) => (
                    <div className="task-row" role="row" key={task.id}>
                      <span>{task.caseAlias}<small>{formatTime(task.createdAt)}</small></span>
                      <span><span className={`priority-pill priority-pill--${priorityCopy[task.priority].tone}`}>{priorityCopy[task.priority].label}</span></span>
                      <span>{task.action}</span>
                      <span>{task.assignee ?? "Unassigned — review now"}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="panel nurse-field-panel" aria-label="Nurse field visits today">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Palliative field operations</p>
                  <h2>My visits today</h2>
                  <p className="subtle">Sequential home visits sorted by clinical severity and route proximity.</p>
                </div>
                <label className="nurse-filter-switch">
                  Staff:
                  <select value={selectedNurseFilter} onChange={(e) => setSelectedNurseFilter(e.target.value)}>
                    {roster.filter((m) => m.role !== "Duty clinician").map((m) => (
                      <option key={m.id} value={m.name}>{m.name} ({m.serviceArea})</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="nurse-visits-summary">
                <span><strong>{tasks.filter((t) => t.assignee === selectedNurseFilter).length}</strong> visits assigned</span>
                <span><strong>{tasks.filter((t) => t.assignee === selectedNurseFilter && t.state === "completed").length}</strong> completed</span>
                <span className="nurse-hub-tag">Hub: Kozhikode Medical College</span>
              </div>

              <div className="nurse-visits-list">
                {tasks.filter((t) => t.assignee === selectedNurseFilter).length > 0 ? (
                  tasks.filter((t) => t.assignee === selectedNurseFilter).map((task, idx) => {
                    const matchedCase = coverageCases.find((c) => c.caseAlias === task.caseAlias);
                    return (
                      <article className="nurse-visit-card" key={task.id}>
                        <div className="nurse-visit-top">
                          <span className="visit-seq-badge">#{idx + 1}</span>
                          <div>
                            <h3>{task.caseAlias}</h3>
                            <p className="visit-locality">📍 {matchedCase?.locality ?? "Calicut zone"} · ETA ~{matchedCase?.etaMinutes ?? 20}m</p>
                          </div>
                          <span className={`priority-pill priority-pill--${priorityCopy[task.priority].tone}`}>{priorityCopy[task.priority].label}</span>
                        </div>
                        <p className="visit-action"><strong>Prepared plan:</strong> {task.action}</p>
                        <div className="visit-state-bar">
                          <span className="microcopy">Status: <strong>{task.state.replaceAll("_", " ")}</strong></span>
                          <div className="visit-state-buttons">
                            <button
                              type="button"
                              className={`small-btn ${task.state === "assigned" ? "is-current" : ""}`}
                              onClick={() => updateTaskVisitState(task.id, "assigned")}
                            >
                              Scheduled
                            </button>
                            <button
                              type="button"
                              className={`small-btn ${task.state === "en_route" ? "is-current" : ""}`}
                              onClick={() => updateTaskVisitState(task.id, "en_route" as CareTask["state"])}
                            >
                              En route
                            </button>
                            <button
                              type="button"
                              className={`small-btn ${task.state === "completed" ? "is-current" : ""}`}
                              onClick={() => updateTaskVisitState(task.id, "completed" as CareTask["state"])}
                            >
                              Completed
                            </button>
                          </div>
                        </div>
                        <div className="nurse-visit-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              const text = encodeURIComponent(`Namaskaram. Nurse ${selectedNurseFilter} from IPM 24 Care is en route for home visit (${task.caseAlias}). ETA ~${matchedCase?.etaMinutes ?? 20} mins.`);
                              window.open(`https://wa.me/?text=${text}`, "_blank");
                            }}
                          >
                            💬 WhatsApp caregiver
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              const query = encodeURIComponent(`${matchedCase?.locality ?? "Kozhikode"}, Kerala`);
                              window.open(`https://www.google.com/maps/dir/?api=1&destination=${query}`, "_blank");
                            }}
                          >
                            🧭 Directions
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="empty-copy">No field visits are currently assigned to {selectedNurseFilter}. Assign cases from the Case Map or triage queue.</p>
                )}
              </div>
            </section>
          )}
        </div>
            <aside className="audit-rail">
              <section className="panel compact-card">
                <p className="eyebrow">Traceability</p><h2>Audit trail</h2>
                <ol className="audit-list">
                  {audit.slice(0, 6).map((event) => <li key={event.id}><time>{formatTime(event.at)}</time><strong>{event.action}</strong><span>{event.detail}</span></li>)}
                </ol>
              </section>
            </aside>
          </section>
        )}

        {view === "benchmark" && (
          <section className="benchmark-layout" aria-label="Transcription provider benchmark">
            <section className="panel benchmark-intro">
              <p className="eyebrow">Evaluation workspace</p>
              <h2>Select a provider using reviewed evidence—not a marketing claim.</h2>
              <p className="subtle">These are illustrative placeholders for 12 clinician-reviewed test calls. Replace them with IPM-approved Malayalam, English, code-switched, noisy, incomplete, routine, urgent, and possible-emergency test cases.</p>
            </section>
            <div className="benchmark-cards">
              {illustrativeBenchmarks.map((benchmark) => (
                <button key={benchmark.provider} className={`benchmark-card ${selectedProvider === benchmark.provider ? "is-selected" : ""}`} onClick={() => setSelectedProvider(benchmark.provider)}>
                  <span className="benchmark-choice">{selectedProvider === benchmark.provider ? "Selected for demo" : "View benchmark"}</span>
                  <strong>{benchmark.provider}</strong>
                  <span>{benchmark.evaluatedCalls} illustrative reviewed calls</span>
                  <b>{benchmark.policyCueRecall}% policy-cue recall</b>
                </button>
              ))}
            </div>
            <section className="panel metrics-panel">
              <div className="panel-heading"><div><p className="eyebrow">Selected comparison</p><h2>{activeBenchmark.provider}</h2></div><span className="demo-badge">Illustrative</span></div>
              <div className="metric-grid">
                <div><span>Transcript accuracy</span><strong>{activeBenchmark.clinicianReviewedAccuracy}%</strong><small>clinician reviewed</small></div>
                <div><span>Policy-cue recall</span><strong>{activeBenchmark.policyCueRecall}%</strong><small>fictional test signals</small></div>
                <div><span>Final latency</span><strong>{activeBenchmark.medianFinalLatencyMs} ms</strong><small>median final turn</small></div>
                <div><span>Code-switching</span><strong>{activeBenchmark.codeSwitching}%</strong><small>Malayalam + English</small></div>
                <div><span>Stream recovery</span><strong>{activeBenchmark.droppedStreamRecovery}%</strong><small>controlled drop test</small></div>
              </div>
              <div className="benchmark-checklist">
                <h3>Release gate</h3>
                <ul>
                  <li>IPM clinician signs off on the real policy and evaluation set.</li>
                  <li>Provider handles the approved Malayalam/English call conditions acceptably.</li>
                  <li>Fallback to manual intake is tested before any pilot.</li>
                </ul>
              </div>
            </section>
          </section>
        )}
      </section>
    </main>
  );
}
