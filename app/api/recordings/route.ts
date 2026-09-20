import { NextResponse } from "next/server";
import { createRecording, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

const supportedContentTypes = new Set(["audio/webm", "audio/webm;codecs=opus", "audio/ogg", "audio/mp4"]);

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "An authenticated care account is required to record a call." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { consent?: unknown; caseId?: unknown; contentType?: unknown } | null;
  if (!body || body.consent !== true) {
    return NextResponse.json({ error: "Explicit recording consent is required." }, { status: 400 });
  }

  try {
    const recording = await createRecording(session, {
      caseId: typeof body.caseId === "string" ? body.caseId : null,
      contentType:
        typeof body.contentType === "string" && supportedContentTypes.has(body.contentType) ? body.contentType : "audio/webm",
    });
    return NextResponse.json({ recording }, { status: 201 });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to create recording session.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
