import { NextResponse } from "next/server";
import type { Assessment, TranscriptSegment } from "@/lib/types";
import type { PersistedCaseDetail, PersistedCaseRecord } from "@/lib/persistence-contract";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest } from "@/lib/supabase-rest";

interface PersistedTranscriptRow {
  id: string;
  transcript: string;
  speaker: TranscriptSegment["speaker"];
  language: TranscriptSegment["language"];
  status: TranscriptSegment["status"];
  captured_at: string;
}

interface PersistedAssessmentRow {
  output: unknown;
}

function extractAssessment(output: unknown): Assessment | null {
  if (!output || typeof output !== "object") return null;
  const value = output as { assessment?: unknown };
  const assessment = value.assessment ?? output;
  return assessment && typeof assessment === "object" ? assessment as Assessment : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session || !["clinician", "care_coordinator", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Clinician review access is required." }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const encodedId = encodeURIComponent(id);
    const cases = await supabaseRestRequest<PersistedCaseRecord[]>(`/care_case?id=eq.${encodedId}&select=*`, { accessToken: session.accessToken });
    const careCase = cases[0];
    if (!careCase) return NextResponse.json({ error: "Care case not found." }, { status: 404 });

    const [transcriptRows, assessmentRows] = await Promise.all([
      supabaseRestRequest<PersistedTranscriptRow[]>(`/transcript_segment?case_id=eq.${encodedId}&select=id,transcript,speaker,language,status,captured_at&order=captured_at.asc`, { accessToken: session.accessToken }),
      supabaseRestRequest<PersistedAssessmentRow[]>(`/assessment?case_id=eq.${encodedId}&select=output&order=created_at.desc&limit=1`, { accessToken: session.accessToken }),
    ]);

    const detail: PersistedCaseDetail = {
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
    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load the care case." }, { status: 502 });
  }
}
