import { NextResponse } from "next/server";
import { recordClinicalDecision, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Clinician review access is required." }, { status: 403 });

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { outcome?: unknown; note?: unknown } | null;
  if (!body || (body.outcome !== "confirmed" && body.outcome !== "overridden") || typeof body.note !== "string" || !body.note.trim()) {
    return NextResponse.json({ error: "A decision outcome and note are required." }, { status: 400 });
  }

  try {
    const status = await recordClinicalDecision(session, id, { outcome: body.outcome, note: body.note });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to persist the clinical decision.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
