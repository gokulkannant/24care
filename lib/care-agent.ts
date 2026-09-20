import { demoClinicalPolicy } from "@/lib/clinical-policy";
import { getCareAiProvider } from "@/lib/ai-provider";
import { assessAndTriage } from "@/lib/triage";
import type { Assessment, TriageResult } from "@/lib/types";

export interface ProcessedAudioChunk {
  transcript: string;
  assessment: Assessment;
  triage: TriageResult;
  nextPrompt: string;
}

export async function transcribeAudio(data: ArrayBuffer, contentType: string): Promise<string> {
  const transcript = await getCareAiProvider().transcribeAudio(data, contentType);
  if (!transcript) throw new Error("The configured AI provider returned no transcript for the audio chunk.");
  return transcript;
}

export async function generateNextPrompt(transcript: string, triage: TriageResult): Promise<string> {
  const prompt = await getCareAiProvider().generateNextPrompt(transcript, triage);
  if (!prompt) throw new Error("The configured AI provider returned no next intake question.");
  return prompt;
}

export async function processAudioChunk(data: ArrayBuffer, contentType: string, transcriptSoFar: string): Promise<ProcessedAudioChunk> {
  const transcript = await transcribeAudio(data, contentType);
  const combinedTranscript = [transcriptSoFar.trim(), transcript].filter(Boolean).join(" ");
  const { assessment, triage } = assessAndTriage(combinedTranscript, demoClinicalPolicy);
  const nextPrompt = await generateNextPrompt(combinedTranscript, triage);
  return { transcript, assessment, triage, nextPrompt };
}
