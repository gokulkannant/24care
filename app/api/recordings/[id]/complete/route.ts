import { NextResponse } from "next/server";
import { completeRecording, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Authentication is required to complete a recording." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { caseId?: unknown; durationMs?: unknown } | null;
  const { id } = await context.params;
  const durationMs =
    typeof body?.durationMs === "number" && Number.isFinite(body.durationMs) && body.durationMs >= 0
      ? Math.round(body.durationMs)
      : 0;

  try {
    await completeRecording(session, id, {
      durationMs,
      ...(typeof body?.caseId === "string" ? { caseId: body.caseId } : {}),
    });
    return NextResponse.json({ ok: true, recordingId: id, status: "ready" });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to complete recording.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
