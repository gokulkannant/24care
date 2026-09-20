export interface GeminiVertexConfig {
  project: string;
  location: string;
  model: string;
  liveModel: string;
}


type Environment = Record<string, string | undefined>;

/**
 * Configuration only: credentials are resolved by Google Application Default
 * Credentials (ADC), never from a browser-exposed API key.
 */
export function getGeminiVertexConfig(environment: Environment = process.env): GeminiVertexConfig {
  const project = environment.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT is required. Configure Application Default Credentials with `gcloud auth application-default login` for local development.",
    );
  }

  return {
    project,
    location: environment.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1",
    model: environment.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
    liveModel: environment.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live",
  };
}
