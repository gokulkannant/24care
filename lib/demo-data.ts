import type { AuditEvent, BenchmarkRun, CareTask, StaffMember, TranscriptSegment } from "./types";

export const seededRoster: StaffMember[] = [
  {
    id: "staff-01",
    name: "Dr. Anjana R.",
    role: "Duty clinician",
    serviceArea: "Medical College / North zone",
    shift: "19:00–07:00",
    contactMethod: "Internal duty phone",
    status: "available",
  },
  {
    id: "staff-02",
    name: "Nurse Fathima K.",
    role: "Palliative nurse",
    serviceArea: "City zone",
    shift: "19:00–01:00",
    contactMethod: "Internal duty phone",
    status: "available",
  },
  {
    id: "staff-03",
    name: "Nurse Nikhil V.",
    role: "Palliative nurse",
    serviceArea: "Outer zone",
    shift: "19:00–07:00",
    contactMethod: "Internal duty phone",
    status: "engaged",
  },
  {
    id: "staff-04",
    name: "Liya S.",
    role: "Care coordinator",
    serviceArea: "All zones",
    shift: "19:00–23:00",
    contactMethod: "Internal dashboard",
    status: "available",
  },
];

export const seededTasks: CareTask[] = [
  {
    id: "task-01",
    caseAlias: "Demo case #18",
    priority: "same_day_queue",
    assignee: "Liya S.",
    action: "Confirm transport-support details.",
    state: "assigned",
    createdAt: "2026-09-19T18:42:00.000Z",
  },
  {
    id: "task-02",
    caseAlias: "Demo case #17",
    priority: "urgent_review",
    assignee: null,
    action: "Duty clinician review pending.",
    state: "unassigned_urgent",
    createdAt: "2026-09-19T18:35:00.000Z",
  },
];

export const seededAudit: AuditEvent[] = [
  {
    id: "audit-01",
    at: "2026-09-19T18:42:00.000Z",
    actor: "Duty clinician",
    action: "Confirmed task",
    detail: "Demo case #18 was assigned to care coordination.",
  },
  {
    id: "audit-02",
    at: "2026-09-19T18:35:00.000Z",
    actor: "Call handler",
    action: "Submitted intake",
    detail: "Demo case #17 entered clinician review queue.",
  },
];

export const demoSegments: TranscriptSegment[] = [
  {
    id: "demo-segment-1",
    text: "എന്റെ അമ്മയുടെ വേദന കൂടുന്നു. The pain has increased since this evening.",
    status: "final",
    language: "mixed",
    createdAt: "2026-09-19T19:12:00.000Z",
  },
  {
    id: "demo-segment-2",
    text: "The dressing supplies are low; we need supplies today. Please call us back.",
    status: "final",
    language: "mixed",
    createdAt: "2026-09-19T19:12:14.000Z",
  },
];

export const illustrativeBenchmarks: BenchmarkRun[] = [
  {
    provider: "OpenAI live transcription",
    clinicianReviewedAccuracy: 91,
    policyCueRecall: 94,
    medianFinalLatencyMs: 740,
    codeSwitching: 90,
    droppedStreamRecovery: 100,
    evaluatedCalls: 12,
    isIllustrative: true,
  },
  {
    provider: "Gemini live transcription",
    clinicianReviewedAccuracy: 89,
    policyCueRecall: 92,
    medianFinalLatencyMs: 680,
    codeSwitching: 93,
    droppedStreamRecovery: 100,
    evaluatedCalls: 12,
    isIllustrative: true,
  },
];
