import { llm } from "@livekit/agents";
import * as google from "@livekit/agents-plugin-google";
import * as openai from "@livekit/agents-plugin-openai";

type Environment = Record<string, string | undefined>;
export type LiveAiProviderName = "gemini" | "openai";

export interface LiveAiConfig {
  provider: LiveAiProviderName;
  model: string;
  apiKey?: string;
  project?: string;
  location?: string;
  voice: string;
}

function required(environment: Environment, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required when AI_PROVIDER=openai.`);
  return value;
}

export function getLiveAiConfig(environment: Environment = process.env): LiveAiConfig {
  const configuredProvider = environment.AI_PROVIDER?.trim().toLowerCase() || "gemini";
  if (configuredProvider !== "gemini" && configuredProvider !== "openai") {
    throw new Error(`Unsupported AI_PROVIDER: ${configuredProvider}. Use gemini or openai.`);
  }
  if (configuredProvider === "openai") {
    return {
      provider: "openai",
      model: environment.OPENAI_LIVE_MODEL?.trim() || "gpt-realtime",
      apiKey: required(environment, "OPENAI_API_KEY"),
      voice: environment.OPENAI_REALTIME_VOICE?.trim() || "marin",
    };
  }
  const project = environment.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required when AI_PROVIDER=gemini.");
  return {
    provider: "gemini",
    model: environment.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live",
    project,
    location: environment.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1",
    voice: environment.GEMINI_LIVE_VOICE?.trim() || "Puck",
  };
}

export function createRealtimeModel(environment: Environment = process.env, instructions: string): llm.RealtimeModel {
  const config = getLiveAiConfig(environment);
  if (config.provider === "openai") {
    return new openai.realtime.RealtimeModel({
      model: config.model,
      apiKey: config.apiKey,
      voice: config.voice,
      inputAudioTranscription: { model: environment.OPENAI_REALTIME_TRANSCRIPTION_MODEL?.trim() || "whisper-1" },
    });
  }
  return new google.realtime.RealtimeModel({
    model: config.model,
    vertexai: true,
    project: config.project,
    location: config.location,
    voice: config.voice,
    instructions,
  });
}
