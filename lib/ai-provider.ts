import { GoogleGenAI } from "@google/genai";
import { getGeminiVertexConfig } from "@/lib/gemini-config";
import type { TriageResult } from "@/lib/types";

export type AiProviderName = "gemini" | "openai";

type Environment = Record<string, string | undefined>;

interface OpenAiConfig {
  apiKey: string;
  model: string;
  transcriptionModel: string;
}

export interface AiProviderConfig {
  provider: AiProviderName;
  gemini: ReturnType<typeof getGeminiVertexConfig> | null;
  openai: OpenAiConfig | null;
}

export interface CareAiProvider {
  readonly name: AiProviderName;
  transcribeAudio(data: ArrayBuffer, contentType: string): Promise<string>;
  generateNextPrompt(transcript: string, triage: TriageResult): Promise<string>;
}

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when AI_PROVIDER=openai.`);
  return value;
}

export function getAiProviderConfig(environment: Environment = process.env): AiProviderConfig {
  const configuredProvider = environment.AI_PROVIDER?.trim().toLowerCase() || "gemini";
  if (configuredProvider !== "gemini" && configuredProvider !== "openai") {
    throw new Error(`Unsupported AI_PROVIDER: ${configuredProvider}. Use gemini or openai.`);
  }
  const provider = configuredProvider as AiProviderName;
  const openai = provider === "openai"
    ? {
        apiKey: required(environment, "OPENAI_API_KEY"),
        model: environment.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        transcriptionModel: environment.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe",
      }
    : null;

  return {
    provider,
    gemini: provider === "gemini" ? getGeminiVertexConfig(environment) : null,
    openai,
  };
}

function careInstructions(transcript: string, triage: TriageResult) {
  return [
    "You are a supervised care-intake question generator.",
    "The caller will primarily speak Malayalam. Return the next question in natural, conversational Malayalam by default.",
    "If the caller mixes Malayalam and English, keep the question in Malayalam and retain only necessary English names or technical terms.",
    "Use English only when the caller clearly asks for English or is speaking entirely in English.",
    "Ask exactly one short follow-up question. Return only the spoken question.",
    "Never diagnose, prescribe, triage, promise care, advise, refer, dispatch, or make an emergency decision.",
    JSON.stringify({ transcript, currentPriority: triage.priority, requiredFollowUps: triage.requiredFollowUps }),
  ].join("\n");
}

function getGeminiClient(config: NonNullable<AiProviderConfig["gemini"]>) {
  return new GoogleGenAI({ vertexai: true, project: config.project, location: config.location });
}

async function transcribeWithGemini(data: ArrayBuffer, contentType: string, config: NonNullable<AiProviderConfig["gemini"]>) {
  const response = await getGeminiClient(config).models.generateContent({
    model: config.model,
    contents: [
      { inlineData: { data: Buffer.from(data).toString("base64"), mimeType: contentType || "audio/webm" } },
      { text: "Transcribe this consented care-intake audio verbatim. Preserve Malayalam, English, and code-switching. Return only the spoken transcript: no timestamps, speaker labels, clinical interpretation, advice, or summary." },
    ],
    config: { temperature: 0 },
  });
  return response.text?.trim() || "";
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function stringProperty(value: unknown, key: string): string | null {
  const field = property(value, key);
  return typeof field === "string" ? field : null;
}

function arrayProperty(value: unknown, key: string): unknown[] {
  const field = property(value, key);
  return Array.isArray(field) ? field : [];
}

async function openAiRequest(path: string, init: RequestInit, apiKey: string): Promise<unknown> {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = stringProperty(property(payload, "error"), "message");
    throw new Error(message || `OpenAI request failed with status ${response.status}.`);
  }
  return payload ?? {};
}

async function transcribeWithOpenAi(data: ArrayBuffer, contentType: string, config: OpenAiConfig) {
  const form = new FormData();
  form.append("file", new Blob([data], { type: contentType || "audio/webm" }), "care-intake.webm");
  form.append("model", config.transcriptionModel);
  form.append("response_format", "json");
  const payload = await openAiRequest("/audio/transcriptions", { method: "POST", body: form }, config.apiKey);
  return stringProperty(payload, "text")?.trim() || "";
}

function responseText(payload: unknown) {
  const direct = stringProperty(payload, "output_text");
  if (direct) return direct.trim();
  return arrayProperty(payload, "output").flatMap((item) => arrayProperty(item, "content").flatMap((part) => {
    const text = stringProperty(part, "text");
    return text ? [text] : [];
  })).join(" ").trim();
}

async function generateWithOpenAi(transcript: string, triage: TriageResult, config: OpenAiConfig) {
  const payload = await openAiRequest("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, instructions: careInstructions(transcript, triage), input: "Generate the next question now.", max_output_tokens: 100 }),
  }, config.apiKey);
  return responseText(payload);
}

export function getCareAiProvider(environment: Environment = process.env): CareAiProvider {
  const config = getAiProviderConfig(environment);
  if (config.provider === "openai" && config.openai) {
    const openai = config.openai;
    return {
      name: "openai",
      transcribeAudio: (data, contentType) => transcribeWithOpenAi(data, contentType, openai),
      generateNextPrompt: (transcript, triage) => generateWithOpenAi(transcript, triage, openai),
    };
  }
  if (!config.gemini) throw new Error("Gemini configuration is unavailable.");
  const gemini = config.gemini;
  return {
    name: "gemini",
    transcribeAudio: (data, contentType) => transcribeWithGemini(data, contentType, gemini),
    generateNextPrompt: async (transcript, triage) => {
      const response = await getGeminiClient(gemini).models.generateContent({
        model: gemini.model,
        contents: { role: "user", parts: [{ text: careInstructions(transcript, triage) }] },
        config: { temperature: 0.1, maxOutputTokens: 100 },
      });
      return response.text?.trim() || "";
    },
  };
}
