import { NextResponse } from "next/server";
import { canAccessCase, canReviewCases } from "@/lib/authorization";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest } from "@/lib/supabase-rest";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Authentication is required to complete a recording." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { caseId?: unknown; durationMs?: unknown } | null;
  const { id } = await context.params;
  const durationMs = typeof body?.durationMs === "number" && Number.isFinite(body.durationMs) && body.durationMs >= 0 ? Math.round(body.durationMs) : 0;

  try {
    const recordings = await supabaseRestRequest<Array<{ id: string; initiated_by: string }>>(`/call_recording?id=eq.${encodeURIComponent(id)}&select=id,initiated_by`, { accessToken: session.accessToken });
    const recording = recordings[0];
    if (!recording) return NextResponse.json({ error: "Recording not found or not accessible." }, { status: 404 });
    if (recording.initiated_by !== session.userId && !canReviewCases(session)) return NextResponse.json({ error: "Recording access is forbidden." }, { status: 403 });
    if (typeof body?.caseId === "string" && !(await canAccessCase(session, body.caseId))) return NextResponse.json({ error: "The case is not accessible." }, { status: 403 });
    await supabaseRestRequest(`/call_recording?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      accessToken: session.accessToken,
      body: {
        status: "ready",
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
        ...(typeof body?.caseId === "string" ? { case_id: body.caseId } : {}),
      },
    });
    return NextResponse.json({ ok: true, recordingId: id, status: "ready" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete recording." }, { status: 502 });
  }
}
