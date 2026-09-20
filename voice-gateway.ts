import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from "@google/genai";
import { jwtVerify } from "jose";

type GatewaySocket = {
  data: { ticket: string };
  send(message: string): void;
  close(code?: number, reason?: string): void;
};

type GatewayServer = {
  upgrade(request: Request, options: { data: { ticket: string } }): boolean;
};

declare const Bun: {
  serve<T>(options: {
    port: number;
    fetch(request: Request, server: GatewayServer): Response | Promise<Response>;
    websocket: {
      open(socket: GatewaySocket): void | Promise<void>;
      message(socket: GatewaySocket, message: string | Uint8Array): void | Promise<void>;
      close(socket: GatewaySocket): void | Promise<void>;
    };
  }): unknown;
};

const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
const model = process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";
const authSecret = process.env.AUTH_JWT_SECRET?.trim();
const port = Number(process.env.LIVE_GATEWAY_PORT || 8787);

if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for the ADC Gemini Live gateway.");
if (!authSecret || authSecret.length < 32) throw new Error("AUTH_JWT_SECRET must be set to at least 32 characters for the live gateway.");

const client = new GoogleGenAI({
  vertexai: true,
  project,
  location,
  apiVersion: "v1beta1",
});
const sessions = new Map<GatewaySocket, Session>();
const secret = new TextEncoder().encode(authSecret);
const instructions = [
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

async function verifyTicket(ticket: string) {
  const result = await jwtVerify(ticket, secret, { algorithms: ["HS256"], audience: "gemini-live-gateway", issuer: "24-care" });
  if (result.payload.tokenType !== "live-gateway" || result.payload.provider !== "gemini") throw new Error("Invalid live gateway ticket.");
}

function send(socket: GatewaySocket, message: LiveServerMessage) {
  socket.send(JSON.stringify(message));
}

async function forwardClientMessage(session: Session, raw: string) {
  const message = JSON.parse(raw) as {
    realtimeInput?: { audio?: { data?: string; mimeType?: string }; text?: string; audioStreamEnd?: boolean };
    clientContent?: { turns?: unknown; turnComplete?: boolean };
  };
  if (message.realtimeInput?.audio?.data) {
    await session.sendRealtimeInput({ audio: message.realtimeInput.audio });
  } else if (message.realtimeInput?.text) {
    await session.sendRealtimeInput({ text: message.realtimeInput.text });
  } else if (message.realtimeInput?.audioStreamEnd) {
    await session.sendRealtimeInput({ audioStreamEnd: true });
  } else if (message.clientContent) {
    await session.sendClientContent({ turns: message.clientContent.turns as never, turnComplete: message.clientContent.turnComplete });
  }
}

const pendingMessages = new Map<GatewaySocket, string[]>();

Bun.serve<GatewaySocket["data"]>({
  port,
  fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname !== "/live" || request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("24 Care Gemini Live gateway", { status: 200 });
    }
    const ticket = url.searchParams.get("ticket");
    if (!ticket || !server.upgrade(request, { data: { ticket } })) return new Response("Unauthorized", { status: 401 });
    return new Response(null, { status: 101 });
  },
  websocket: {
    async open(socket) {
      try {
        await verifyTicket(socket.data.ticket);
        const session = await client.live.connect({
          model,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: { languageCode: "ml" },
            systemInstruction: { parts: [{ text: instructions }] },
          },
          callbacks: {
            onmessage: (message) => send(socket, message),
            onerror: () => socket.close(1011, "Gemini Live session failed"),
            onclose: () => socket.close(1000, "Gemini Live session ended"),
          },
        });
        sessions.set(socket, session);
        const queued = pendingMessages.get(socket) ?? [];
        pendingMessages.delete(socket);
        for (const queuedMessage of queued) await forwardClientMessage(session, queuedMessage);
        await session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: "Begin the consented care intake now. Greet the caller in Malayalam and ask the first question in Malayalam." }] }],
          turnComplete: true,
        });
      } catch {
        socket.close(1008, "Live gateway authentication or Gemini connection failed");
      }
    },
    async message(socket, rawMessage) {
      const raw = typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage);
      const session = sessions.get(socket);
      if (!session) {
        pendingMessages.set(socket, [...(pendingMessages.get(socket) ?? []), raw]);
        return;
      }
      try {
        await forwardClientMessage(session, raw);
      } catch {
        socket.close(1011, "Invalid live message");
      }
    },
    close(socket) {
      const session = sessions.get(socket);
      sessions.delete(socket);
      pendingMessages.delete(socket);
      session?.close();
    },
  },
});

console.log(`24 Care Gemini Live gateway listening on ws://127.0.0.1:${port}/live using ${model} with ADC`);
