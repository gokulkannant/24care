import { NextResponse } from "next/server";
import { appendTranscriptSegment, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";
import type { TranscriptSegment } from "@/lib/types";

const speakers = new Set<TranscriptSegment["speaker"]>(["caller", "assistant", "clinician", "system"]);
const languages = new Set<TranscriptSegment["language"]>(["ml", "en", "mixed"]);
const statuses = new Set<TranscriptSegment["status"]>(["partial", "final"]);

function pick<T>(value: unknown, allowed: Set<T>, fallback: T): T {
  return allowed.has(value as T) ? (value as T) : fallback;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Authentication is required to persist transcript audio processing." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    speaker?: unknown;
    language?: unknown;
    status?: unknown;
    providerItemId?: unknown;
  } | null;
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json({ error: "A non-empty transcript segment is required." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const segment = await appendTranscriptSegment(session, id, {
      text: body.text,
      speaker: pick(body.speaker, speakers, "caller"),
      language: pick(body.language, languages, "mixed"),
      status: pick(body.status, statuses, "final"),
      providerItemId: typeof body.providerItemId === "string" ? body.providerItemId : null,
    });
    return NextResponse.json({ segment }, { status: 201 });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to persist transcript segment.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
