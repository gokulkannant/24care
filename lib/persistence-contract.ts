import type { Assessment, Priority, TriageResult, TranscriptSegment } from "@/lib/types";

export interface PersistedCaseRecord {
  id: string;
  patient_id: string;
  initiated_by: string;
  case_alias: string;
  caller_relationship: string;
  callback_reference: string;
  policy_version: string;
  priority: Priority;
  status: "open" | "review" | "confirmed" | "overridden" | "closed";
  triage_output: TriageResult;
  created_at: string;
  updated_at: string;
}

export interface PersistedCaseDetail {
  case: PersistedCaseRecord;
  transcriptSegments: TranscriptSegment[];
  assessment: Assessment | null;
}
