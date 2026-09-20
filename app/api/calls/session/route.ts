import { AccessToken, LiveKitAPI } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "@/lib/server-session";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || !["patient", "caretaker", "clinician", "care_coordinator", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "An authenticated care account is required to start an in-app call." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { consent?: unknown; caseId?: unknown } | null;
  if (!body || body.consent !== true) {
    return NextResponse.json({ error: "Explicit call consent is required before opening an audio room." }, { status: 400 });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const liveKitUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!apiKey || !apiSecret || !liveKitUrl) {
    return NextResponse.json({ error: "LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET." }, { status: 503 });
  }

  const roomName = `care-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: session.userId,
    name: session.name,
    ttl: "10m",
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const liveKitHost = liveKitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    const liveKitApi = new LiveKitAPI({ host: liveKitHost, apiKey, secret: apiSecret });
    await liveKitApi.agentDispatch.createDispatch(roomName, "24-care-intake", {
      metadata: JSON.stringify({ caseId: typeof body.caseId === "string" ? body.caseId : null, userId: session.userId }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The care intake agent could not be dispatched." }, { status: 503 });
  }

  return NextResponse.json({
    roomName,
    token: await token.toJwt(),
    url: liveKitUrl,
    caseId: typeof body.caseId === "string" ? body.caseId : null,
    expiresInSeconds: 600,
  });
}
