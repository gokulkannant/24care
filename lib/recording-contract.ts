export type RecordingStatus = "recording" | "processing" | "ready" | "failed";

export interface RecordingRecord {
  id: string;
  case_id: string | null;
  initiated_by: string;
  storage_prefix: string;
  content_type: string;
  status: RecordingStatus;
  duration_ms: number;
  created_at: string;
  completed_at: string | null;
}

export interface RecordingChunkResult {
  recordingId: string;
  sequence: number;
  transcript: string | null;
  nextPrompt: string | null;
  status: RecordingStatus;
}
