import { NextResponse } from "next/server";
import { processAudioChunk, type ProcessedAudioChunk } from "@/lib/care-agent";
import type { RecordingChunkResult } from "@/lib/recording-contract";
import {
  appendAssessment,
  appendTranscriptSegment,
  loadRecording,
  setChunkTranscript,
  storeRecordingChunk,
  toRepositoryError,
  updateRecordingState,
} from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

function isTrue(value: FormDataEntryValue | null) {
  return value === "true" || value === "1";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Authentication is required to upload call audio." }, { status: 401 });

  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const sequenceValue = form?.get("sequence");
  const durationValue = form?.get("durationMs");
  const transcriptSoFar = form?.get("transcriptSoFar");
  if (!(audio instanceof File) || typeof sequenceValue !== "string" || !/^\d+$/.test(sequenceValue)) {
    return NextResponse.json({ error: "Audio, sequence, and recording metadata are required." }, { status: 400 });
  }

  const sequence = Number(sequenceValue);
  const durationMs = typeof durationValue === "string" && /^\d+$/.test(durationValue) ? Number(durationValue) : 0;
  const priorTranscript = typeof transcriptSoFar === "string" ? transcriptSoFar : "";

  try {
    const recording = await loadRecording(session, id);
    const contentType = audio.type || recording.content_type;
    const data = await audio.arrayBuffer();
    await storeRecordingChunk(session, recording, { sequence, data, contentType });

    if (new URL(request.url).searchParams.get("rawOnly") === "true") {
      await updateRecordingState(id, { status: "processing", durationMs });
      return NextResponse.json({ recordingId: id, sequence, status: "processing" }, { status: 201 });
    }

    let processed: ProcessedAudioChunk;
    try {
      processed = await processAudioChunk(data, contentType, priorTranscript);
    } catch (error) {
      await updateRecordingState(id, { status: "failed", durationMs }).catch(() => undefined);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Audio processing failed." }, { status: 502 });
    }

    await setChunkTranscript(id, sequence, processed.transcript);
    if (recording.case_id) {
      if (processed.transcript) {
        await appendTranscriptSegment(session, recording.case_id, {
          text: processed.transcript,
          speaker: "caller",
          language: "mixed",
          status: "final",
        });
      }
      await appendAssessment(session, recording.case_id, {
        provider: processed.assessment.provider,
        policyVersion: processed.triage.policyVersion,
        output: { assessment: processed.assessment, triage: processed.triage },
      });
    }

    const finalChunk = isTrue(form?.get("isFinal") ?? null);
    const status = finalChunk ? "ready" : "processing";
    await updateRecordingState(id, {
      status,
      durationMs,
      ...(finalChunk ? { completedAt: new Date().toISOString() } : {}),
    });

    const result: RecordingChunkResult = {
      recordingId: id,
      sequence,
      transcript: processed.transcript || null,
      nextPrompt: processed.nextPrompt,
      status,
    };
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to store or process audio.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
