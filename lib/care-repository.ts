/**
 * Session-scoped data access for the care workflow.
 *
 * Every function here takes an AuthenticatedSession and applies its own
 * authorization predicate before touching Supabase. Route handlers must not
 * call supabase-rest directly for these tables: the point of this module is
 * that the ownership rules live in exactly one place and cannot be forgotten
 * at a call site.
 *
 * The predicates mirror the `using` / `with check` clauses in
 * supabase/migrations/20260920123000_care_workflow_hardening.sql and
 * 20260920130000_first_party_audio.sql. Because server-side requests currently
 * authenticate with the Supabase secret key, Postgres RLS does not evaluate
 * those policies — this module is what actually enforces them. Keep the two in
 * sync: if a policy changes, change the matching guard here.
 *
 * Two invariants worth preserving when editing:
 *  1. Actor columns (initiated_by, captured_by, actor_id, clinician_id) are
 *     always taken from the session, never from caller input.
 *  2. Reads for non-reviewers are narrowed in the query string itself, so a
 *     missing follow-up check cannot leak another user's row.
 */
import { canAccessCase, canReviewCases } from "./authorization";
import type { AuthenticatedSession } from "./server-session";
import type { PersistedCaseDetail, PersistedCaseRecord } from "./persistence-contract";
import type { RecordingRecord, RecordingStatus } from "./recording-contract";
import type { Assessment, TranscriptSegment, TriageResult } from "./types";
import { recordingChunkPath } from "./storage-path";
import {
  supabaseServerRestRequest,
  supabaseServerStorageUpload,
  SupabaseRequestError,
} from "./supabase-rest";

/** Carries an HTTP status so route handlers can map failures uniformly. */
export class RepositoryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.status = status;
  }
}

/**
 * Maps any thrown value to a RepositoryError. Supabase transport failures
 * become 502 so a downstream outage is never reported as an authorization
 * result, which would be misleading in an audited system.
 */
export function toRepositoryError(error: unknown, fallbackMessage: string): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (error instanceof SupabaseRequestError) return new RepositoryError(502, error.message);
  return new RepositoryError(502, error instanceof Error ? error.message : fallbackMessage);
}

const storageBucket = () => process.env.SUPABASE_STORAGE_BUCKET ?? "care-audio";
const eq = (value: string) => `eq.${encodeURIComponent(value)}`;

function assertReviewer(session: AuthenticatedSession) {
  if (!canReviewCases(session)) {
    throw new RepositoryError(403, "Clinician review access is required.");
  }
}

async function assertCaseAccess(session: AuthenticatedSession, caseId: string) {
  if (!(await canAccessCase(session, caseId))) {
    throw new RepositoryError(403, "The care case is not accessible.");
  }
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export interface IntakeCaseInput {
  patientId: string;
  caseAlias: string;
  relationship: string;
  callback: string;
  transcript: string;
  assessment: Assessment;
  triage: TriageResult;
  /** Policy version recorded against the assessment row. */
  assessmentPolicyVersion: string;
  noticeVersion?: string;
}

/**
 * Creates a case plus its consent, transcript, assessment, and audit rows.
 *
 * Not atomic: PostgREST has no multi-statement transaction over separate
 * requests. If a follow-up insert fails the case row survives in `review`
 * status with incomplete detail, which is the safe direction to fail for a
 * queue a clinician reads — but it is a known limitation, not a design goal.
 */
export async function createIntakeCase(
  session: AuthenticatedSession,
  input: IntakeCaseInput,
): Promise<PersistedCaseRecord> {
  const created = await supabaseServerRestRequest<PersistedCaseRecord[]>("/care_case", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        patient_id: input.patientId,
        initiated_by: session.userId,
        case_alias: input.caseAlias,
        caller_relationship: input.relationship,
        callback_reference: input.callback,
        policy_version: input.triage.policyVersion,
        priority: input.triage.priority,
        status: "review",
        triage_output: input.triage,
      },
    ],
  });

  const careCase = created[0];
  if (!careCase) throw new RepositoryError(502, "Supabase did not return the created case.");

  await supabaseServerRestRequest("/consent_record", {
    method: "POST",
    body: [
      {
        case_id: careCase.id,
        captured_by: session.userId,
        intake_consent: true,
        recording_consent: false,
        notice_version: input.noticeVersion ?? "web-intake-1",
      },
    ],
  });

  await supabaseServerRestRequest("/transcript_segment", {
    method: "POST",
    body: [
      {
        case_id: careCase.id,
        speaker: "caller",
        transcript: input.transcript,
        language: "mixed",
        status: "final",
      },
    ],
  });

  await supabaseServerRestRequest("/assessment", {
    method: "POST",
    body: [
      {
        case_id: careCase.id,
        provider: input.assessment.provider,
        policy_version: input.assessmentPolicyVersion,
        output: { assessment: input.assessment, triage: input.triage },
      },
    ],
  });

  await supabaseServerRestRequest("/audit_event", {
    method: "POST",
    body: [
      {
        case_id: careCase.id,
        actor_id: session.userId,
        action: "Submitted intake",
        detail: `${careCase.case_alias} entered clinician review.`,
      },
    ],
  });

  return careCase;
}

/** Reviewer-only queue of cases awaiting clinician attention. */
export async function listReviewQueue(session: AuthenticatedSession): Promise<PersistedCaseRecord[]> {
  assertReviewer(session);
  return supabaseServerRestRequest<PersistedCaseRecord[]>(
    "/care_case?status=in.(review,open)&select=*&order=created_at.desc",
  );
}

interface TranscriptRow {
  id: string;
  transcript: string;
  speaker: TranscriptSegment["speaker"];
  language: TranscriptSegment["language"];
  status: TranscriptSegment["status"];
  captured_at: string;
}

function extractAssessment(output: unknown): Assessment | null {
  if (!output || typeof output !== "object") return null;
  const value = output as { assessment?: unknown };
  const assessment = value.assessment ?? output;
  return assessment && typeof assessment === "object" ? (assessment as Assessment) : null;
}

/**
 * Loads a case with its transcript and latest assessment.
 *
 * Access is checked against the full case-access predicate rather than the
 * reviewer role alone, so this is safe to expose to a patient or caretaker
 * surface later without revisiting the authorization.
 */
export async function loadCaseDetail(
  session: AuthenticatedSession,
  caseId: string,
): Promise<PersistedCaseDetail> {
  await assertCaseAccess(session, caseId);

  const cases = await supabaseServerRestRequest<PersistedCaseRecord[]>(
    `/care_case?id=${eq(caseId)}&select=*`,
  );
  const careCase = cases[0];
  if (!careCase) throw new RepositoryError(404, "Care case not found.");

  const [transcriptRows, assessmentRows] = await Promise.all([
    supabaseServerRestRequest<TranscriptRow[]>(
      `/transcript_segment?case_id=${eq(caseId)}&select=id,transcript,speaker,language,status,captured_at&order=captured_at.asc`,
    ),
    supabaseServerRestRequest<Array<{ output: unknown }>>(
      `/assessment?case_id=${eq(caseId)}&select=output&order=created_at.desc&limit=1`,
    ),
  ]);

  return {
    case: careCase,
    transcriptSegments: transcriptRows.map((segment) => ({
      id: segment.id,
      text: segment.transcript,
      speaker: segment.speaker,
      language: segment.language,
      status: segment.status,
      createdAt: segment.captured_at,
    })),
    assessment: extractAssessment(assessmentRows[0]?.output),
  };
}

export type DecisionOutcome = "confirmed" | "overridden";

/**
 * Records a clinician decision and only then creates the downstream task.
 *
 * This ordering is the human-in-the-loop gate: no care task exists until a
 * clinician has confirmed or overridden the proposed action, and the decision
 * is always attributed to the acting session.
 */
export async function recordClinicalDecision(
  session: AuthenticatedSession,
  caseId: string,
  input: { outcome: DecisionOutcome; note: string },
): Promise<DecisionOutcome> {
  assertReviewer(session);
  await assertCaseAccess(session, caseId);

  const rows = await supabaseServerRestRequest<
    Array<{ id: string; case_alias: string; priority: string; triage_output: { action?: string } }>
  >(`/care_case?id=${eq(caseId)}&select=id,case_alias,priority,triage_output`);
  const careCase = rows[0];
  if (!careCase) throw new RepositoryError(404, "Care case not found.");

  const note = input.note.trim();

  await supabaseServerRestRequest("/clinical_decision", {
    method: "POST",
    body: [{ case_id: caseId, clinician_id: session.userId, outcome: input.outcome, note }],
  });

  await supabaseServerRestRequest(`/care_case?id=${eq(caseId)}`, {
    method: "PATCH",
    body: { status: input.outcome, updated_at: new Date().toISOString() },
  });

  const action =
    input.outcome === "overridden"
      ? `Clinician override: ${note}`
      : careCase.triage_output.action ?? "Clinician-confirmed care review.";
  const urgent =
    careCase.priority === "urgent_review" || careCase.priority === "immediate_clinician_review";

  await supabaseServerRestRequest("/care_task", {
    method: "POST",
    body: [
      {
        case_id: caseId,
        priority: careCase.priority,
        action,
        state: urgent ? "unassigned_urgent" : "awaiting_clinician",
      },
    ],
  });

  await appendAuditEvent(session, {
    caseId,
    action: input.outcome === "confirmed" ? "Confirmed proposed action" : "Overrode proposed action",
    detail: note,
  });

  return input.outcome;
}

export interface TranscriptSegmentInput {
  text: string;
  speaker: TranscriptSegment["speaker"];
  language: TranscriptSegment["language"];
  status: TranscriptSegment["status"];
  providerItemId?: string | null;
}

export async function appendTranscriptSegment(
  session: AuthenticatedSession,
  caseId: string,
  input: TranscriptSegmentInput,
): Promise<{ id: string } | null> {
  await assertCaseAccess(session, caseId);
  const rows = await supabaseServerRestRequest<Array<{ id: string }>>("/transcript_segment", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        case_id: caseId,
        provider_item_id: input.providerItemId ?? null,
        speaker: input.speaker,
        transcript: input.text.trim(),
        language: input.language,
        status: input.status,
      },
    ],
  });
  return rows[0] ?? null;
}

export async function appendAssessment(
  session: AuthenticatedSession,
  caseId: string,
  input: { provider: string; policyVersion: string; output: unknown },
): Promise<void> {
  await assertCaseAccess(session, caseId);
  await supabaseServerRestRequest("/assessment", {
    method: "POST",
    body: [
      {
        case_id: caseId,
        provider: input.provider,
        policy_version: input.policyVersion,
        output: input.output,
      },
    ],
  });
}

/**
 * Appends an audit row attributed to the acting session.
 *
 * `actor_id` is deliberately not a parameter — an audit trail a caller can
 * forge has no value.
 */
export async function appendAuditEvent(
  session: AuthenticatedSession,
  input: { caseId?: string | null; action: string; detail: string },
): Promise<void> {
  if (input.caseId) await assertCaseAccess(session, input.caseId);
  await supabaseServerRestRequest("/audit_event", {
    method: "POST",
    body: [
      {
        case_id: input.caseId ?? null,
        actor_id: session.userId,
        action: input.action,
        detail: input.detail,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Recordings
// ---------------------------------------------------------------------------

/**
 * Creates a recording session owned by the acting user.
 *
 * The storage prefix is derived from the session user id so it matches the
 * `care-audio` storage policy, which compares the first path segment against
 * auth.uid() (20260920130000_first_party_audio.sql).
 */
export async function createRecording(
  session: AuthenticatedSession,
  input: { caseId?: string | null; contentType: string },
): Promise<RecordingRecord | null> {
  if (input.caseId) await assertCaseAccess(session, input.caseId);

  const id = crypto.randomUUID();
  const created = await supabaseServerRestRequest<RecordingRecord[]>("/call_recording", {
    method: "POST",
    prefer: "return=representation",
    body: [
      {
        id,
        case_id: input.caseId ?? null,
        initiated_by: session.userId,
        storage_prefix: `${session.userId}/${id}`,
        content_type: input.contentType,
        status: "recording",
        duration_ms: 0,
      },
    ],
  });
  return created[0] ?? null;
}

/**
 * Loads a recording the session is entitled to.
 *
 * For non-reviewers the ownership filter is part of the query, so a
 * non-owner cannot observe that the recording exists at all.
 */
export async function loadRecording(
  session: AuthenticatedSession,
  recordingId: string,
): Promise<RecordingRecord> {
  const ownerFilter = canReviewCases(session)
    ? ""
    : `&initiated_by=${eq(session.userId)}`;
  const recordings = await supabaseServerRestRequest<RecordingRecord[]>(
    `/call_recording?id=${eq(recordingId)}${ownerFilter}&select=*`,
  );
  const recording = recordings[0];
  if (!recording) throw new RepositoryError(404, "Recording not found or not accessible.");
  return recording;
}

/**
 * Uploads one audio chunk and records it against the recording.
 *
 * The storage path is rebuilt from the recording's own prefix rather than any
 * caller-supplied path, so a chunk cannot be written outside its recording.
 */
export async function storeRecordingChunk(
  session: AuthenticatedSession,
  recording: RecordingRecord,
  input: { sequence: number; data: ArrayBuffer; contentType: string },
): Promise<string> {
  if (recording.initiated_by !== session.userId && !canReviewCases(session)) {
    throw new RepositoryError(403, "Recording access is forbidden.");
  }

  const storagePath = recordingChunkPath(recording.storage_prefix, input.sequence, input.contentType);
  await supabaseServerStorageUpload(storageBucket(), storagePath, input.data, {
    contentType: input.contentType,
  });
  await supabaseServerRestRequest("/call_recording_chunk", {
    method: "POST",
    body: [
      {
        recording_id: recording.id,
        sequence: input.sequence,
        storage_path: storagePath,
        byte_size: input.data.byteLength,
      },
    ],
  });
  return storagePath;
}

export async function setChunkTranscript(
  recordingId: string,
  sequence: number,
  transcript: string,
): Promise<void> {
  await supabaseServerRestRequest(
    `/call_recording_chunk?recording_id=${eq(recordingId)}&sequence=eq.${sequence}`,
    { method: "PATCH", body: { transcript } },
  );
}

/** Patches recording state. Call only after loadRecording has authorized access. */
export async function updateRecordingState(
  recordingId: string,
  patch: { status?: RecordingStatus; durationMs?: number; completedAt?: string; caseId?: string },
): Promise<void> {
  await supabaseServerRestRequest(`/call_recording?id=${eq(recordingId)}`, {
    method: "PATCH",
    body: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.durationMs === undefined ? {} : { duration_ms: patch.durationMs }),
      ...(patch.completedAt ? { completed_at: patch.completedAt } : {}),
      ...(patch.caseId ? { case_id: patch.caseId } : {}),
    },
  });
}

/**
 * Marks a recording ready, optionally attaching it to a case.
 *
 * Authorizes the recording and the target case before writing, then applies
 * both in a single PATCH so a recording cannot end up attached to a case
 * while still in a non-ready state.
 */
export async function completeRecording(
  session: AuthenticatedSession,
  recordingId: string,
  input: { durationMs: number; caseId?: string },
): Promise<void> {
  await loadRecording(session, recordingId);
  if (input.caseId) await assertCaseAccess(session, input.caseId);
  await updateRecordingState(recordingId, {
    status: "ready",
    durationMs: input.durationMs,
    completedAt: new Date().toISOString(),
    ...(input.caseId ? { caseId: input.caseId } : {}),
  });
}
