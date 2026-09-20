import { NextResponse } from "next/server";
import type { RecordingRecord } from "@/lib/recording-contract";
import { canAccessCase } from "@/lib/authorization";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest } from "@/lib/supabase-rest";

const supportedContentTypes = new Set(["audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/mp4"]);

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || !["patient", "caretaker", "clinician", "care_coordinator", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "An authenticated care account is required to record a call." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { consent?: unknown; caseId?: unknown; contentType?: unknown } | null;
  if (!body || body.consent !== true) {
    return NextResponse.json({ error: "Explicit recording consent is required." }, { status: 400 });
  }
  if (typeof body.caseId === "string" && !(await canAccessCase(session, body.caseId))) return NextResponse.json({ error: "The recording case is not accessible." }, { status: 403 });
  const contentType = typeof body.contentType === "string" && supportedContentTypes.has(body.contentType) ? body.contentType : "audio/webm";
  const id = crypto.randomUUID();
  const storagePrefix = `${session.userId}/${id}`;

  try {
    const created = await supabaseRestRequest<RecordingRecord[]>("/call_recording", {
      method: "POST",
      accessToken: session.accessToken,
      prefer: "return=representation",
      body: [{
        id,
        case_id: typeof body.caseId === "string" ? body.caseId : null,
        initiated_by: session.userId,
        storage_prefix: storagePrefix,
        content_type: contentType,
        status: "recording",
        duration_ms: 0,
      }],
    });
    return NextResponse.json({ recording: created[0] ?? null }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create recording session." }, { status: 502 });
  }
}
