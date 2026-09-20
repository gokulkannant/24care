import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { getAuthenticatedSession } from "@/lib/server-session";

const liveInstructions = [
  "You are a supervised care-intake voice assistant.",
  "The caller will primarily speak Malayalam. Reply in natural, conversational Malayalam by default.",
  "If the caller mixes Malayalam and English, keep replying in Malayalam and retain only necessary English names or technical terms.",
  "Switch to English only when the caller clearly asks for English or speaks entirely in English.",
  "Ask one short question at a time and do not translate the caller's words unless they ask.",
  "Start by greeting the caller in Malayalam and asking what is happening.",
  "Never diagnose, prescribe, give clinical advice, promise care, dispatch help, or make an emergency decision.",
  "If the caller describes immediate danger, calmly tell them in Malayalam to contact local emergency services now and state that a clinician will review the call.",
  "Keep responses concise, warm, and easy to hear over a phone speaker.",
].join(" ");

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session || !["patient", "caretaker", "clinician", "care_coordinator", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "An authenticated care account is required to start a live call." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { consent?: unknown } | null;
  if (!body || body.consent !== true) {
    return NextResponse.json({ error: "Explicit live-call consent is required before opening an AI voice session." }, { status: 400 });
  }

  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "gemini";
  try {
    if (provider === "gemini") {
      const gatewayUrl = process.env.LIVE_GATEWAY_URL?.trim();
      const authSecret = process.env.AUTH_JWT_SECRET?.trim();
      const model = process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";
      if (!gatewayUrl) throw new Error("LIVE_GATEWAY_URL is required for ADC Gemini Live.");
      if (!authSecret || authSecret.length < 32) throw new Error("AUTH_JWT_SECRET must be set to at least 32 characters for Gemini Live.");
      const gatewayToken = await new SignJWT({ tokenType: "live-gateway", provider: "gemini" })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(session.userId)
        .setIssuer("24-care")
        .setAudience("gemini-live-gateway")
        .setIssuedAt()
        .setExpirationTime("2m")
        .sign(new TextEncoder().encode(authSecret));
      return NextResponse.json({ provider: "gemini", gatewayUrl, gatewayToken, model, instructions: liveInstructions });
    }

    if (provider === "openai") {
      const apiKey = required("OPENAI_API_KEY");
      const model = process.env.OPENAI_LIVE_MODEL?.trim() || "gpt-realtime";
      const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": session.userId,
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model,
            instructions: liveInstructions,
            audio: {
              output: { voice: process.env.OPENAI_REALTIME_VOICE?.trim() || "marin" },
            },
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { value?: string; client_secret?: { value?: string }; error?: { message?: string } } | null;
      const clientSecret = payload?.value ?? payload?.client_secret?.value;
      if (!response.ok || !clientSecret) {
        throw new Error(payload?.error?.message || `OpenAI realtime session failed with status ${response.status}.`);
      }
      return NextResponse.json({ provider: "openai", clientSecret, model, instructions: liveInstructions });
    }

    return NextResponse.json({ error: `Unsupported live provider: ${provider}. Use gemini or openai.` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The live voice session could not be created." }, { status: 503 });
  }
}
