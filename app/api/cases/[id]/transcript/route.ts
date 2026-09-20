import { NextResponse } from "next/server";
import { canAccessCase } from "@/lib/authorization";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest } from "@/lib/supabase-rest";

const speakers = new Set(["caller", "assistant", "clinician", "system"]);
const languages = new Set(["ml", "en", "mixed"]);
const statuses = new Set(["partial", "final"]);

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

  const speaker = typeof body.speaker === "string" && speakers.has(body.speaker) ? body.speaker : "caller";
  const language = typeof body.language === "string" && languages.has(body.language) ? body.language : "mixed";
  const status = typeof body.status === "string" && statuses.has(body.status) ? body.status : "final";
  const { id } = await context.params;
  if (!(await canAccessCase(session, id))) return NextResponse.json({ error: "The case is not accessible." }, { status: 403 });

  try {
    const rows = await supabaseRestRequest<Array<{ id: string }>>("/transcript_segment", {
      method: "POST",
      accessToken: session.accessToken,
      prefer: "return=representation",
      body: [{
        case_id: id,
        provider_item_id: typeof body.providerItemId === "string" ? body.providerItemId : null,
        speaker,
        transcript: body.text.trim(),
        language,
        status,
      }],
    });
    return NextResponse.json({ segment: rows[0] ?? null }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to persist transcript segment." }, { status: 502 });
  }
}
