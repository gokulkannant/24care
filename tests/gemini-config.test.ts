import assert from "node:assert/strict";
import test from "node:test";
import { getAiProviderConfig } from "../lib/ai-provider";
import { getGeminiVertexConfig } from "../lib/gemini-config";

test("Gemini Vertex configuration uses the configured recording and Live API models", () => {
  assert.deepEqual(getGeminiVertexConfig({ GOOGLE_CLOUD_PROJECT: "care-demo" }), {
    project: "care-demo",
    location: "us-central1",
    model: "gemini-3.8-flash",
    liveModel: "gemini-3.8-live",
  });
});

test("provider selection does not require Gemini credentials for OpenAI", () => {
  assert.deepEqual(getAiProviderConfig({ AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key" }), {
    provider: "openai",
    gemini: null,
    openai: {
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
    },
  });
});

test("Gemini Vertex configuration fails closed without a Google Cloud project", () => {
  assert.throws(() => getGeminiVertexConfig({}), /GOOGLE_CLOUD_PROJECT is required/);
});
