export const priorityLevels = [
  "immediate_clinician_review",
  "urgent_review",
  "same_day_queue",
  "routine_queue",
  "insufficient_information",
] as const;

export type Priority = (typeof priorityLevels)[number];
export type TranscriptStatus = "partial" | "final";
export type StaffStatus = "available" | "engaged" | "unavailable";
export type StaffRole = "Duty clinician" | "Palliative nurse" | "Care coordinator";

export interface TranscriptSegment {
  id: string;
  text: string;
  status: TranscriptStatus;
  createdAt: string;
  language: "ml" | "en" | "mixed";
  speaker?: "caller" | "assistant" | "clinician" | "system";
}

export interface PolicySignal {
  id: string;
  label: string;
  patterns: string[];
  description: string;
}

export interface PolicyRule {
  id: string;
  title: string;
  priority: Priority;
  action: string;
  destinationType: string;
  requiredFollowUps: string[];
  signalIds: string[];
  sortOrder: number;
}

export interface ClinicalPolicy {
  id: string;
  version: string;
  name: string;
  isDemoOnly: boolean;
  approvalStatus: "demo_only" | "pending_ipm_approval" | "approved";
  signals: PolicySignal[];
  rules: PolicyRule[];
}

export interface SignalEvidence {
  signalId: string;
  label: string;
  excerpts: string[];
}

export interface Assessment {
  provider: string;
  signals: SignalEvidence[];
  uncertainty: "low" | "moderate" | "high";
  missingQuestions: string[];
  createdAt: string;
  note: string;
}

export interface TriageResult {
  priority: Priority;
  ruleId: string;
  ruleTitle: string;
  action: string;
  destinationType: string;
  requiredFollowUps: string[];
  matchedSignals: SignalEvidence[];
  uncertainty: Assessment["uncertainty"];
  policyVersion: string;
  requiresClinicianConfirmation: true;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  serviceArea: string;
  shift: string;
  contactMethod: string;
  status: StaffStatus;
}

export interface CareTask {
  id: string;
  caseAlias: string;
  priority: Priority;
  assignee: string | null;
  action: string;
  state: "draft" | "awaiting_clinician" | "assigned" | "unassigned_urgent";
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface ClinicalDecision {
  outcome: "confirmed" | "overridden";
  note: string;
  decidedBy: string;
  decidedAt: string;
}

export interface BenchmarkRun {
  provider: "OpenAI live transcription" | "Gemini live transcription";
  clinicianReviewedAccuracy: number;
  policyCueRecall: number;
  medianFinalLatencyMs: number;
  codeSwitching: number;
  droppedStreamRecovery: number;
  evaluatedCalls: number;
  isIllustrative: true;
}
