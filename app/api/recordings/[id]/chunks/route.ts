import { NextResponse } from "next/server";
import { processAudioChunk, type ProcessedAudioChunk } from "@/lib/care-agent";
import type { RecordingRecord, RecordingChunkResult } from "@/lib/recording-contract";
import { canReviewCases } from "@/lib/authorization";
import { getAuthenticatedSession } from "@/lib/server-session";
import { supabaseRestRequest, supabaseStorageUpload } from "@/lib/supabase-rest";
import { recordingChunkPath } from "@/lib/storage-path";

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
    const recordings = await supabaseRestRequest<RecordingRecord[]>(`/call_recording?id=eq.${encodeURIComponent(id)}&select=*`, { accessToken: session.accessToken });
    const recording = recordings[0];
    if (!recording) return NextResponse.json({ error: "Recording not found or not accessible." }, { status: 404 });
    if (recording.initiated_by !== session.userId && !canReviewCases(session)) return NextResponse.json({ error: "Recording access is forbidden." }, { status: 403 });

    const storagePath = recordingChunkPath(recording.storage_prefix, sequence, audio.type || recording.content_type);
    const data = await audio.arrayBuffer();
    const storageBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "care-audio";
    await supabaseStorageUpload(storageBucket, storagePath, data, { accessToken: session.accessToken, contentType: audio.type || recording.content_type });
    await supabaseRestRequest("/call_recording_chunk", {
      method: "POST",
      accessToken: session.accessToken,
      body: [{ recording_id: id, sequence, storage_path: storagePath, byte_size: data.byteLength }],
    });
    const rawOnly = new URL(request.url).searchParams.get("rawOnly") === "true";
    if (rawOnly) {
      await supabaseRestRequest(`/call_recording?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: { status: "processing", duration_ms: durationMs },
      });
      return NextResponse.json({ recordingId: id, sequence, status: "processing" }, { status: 201 });
    }

    let processed: ProcessedAudioChunk;
    try {
      processed = await processAudioChunk(data, audio.type || recording.content_type, priorTranscript);
    } catch (error) {
      await supabaseRestRequest(`/call_recording?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: { status: "failed", duration_ms: durationMs },
      }).catch(() => undefined);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Audio processing failed." }, { status: 502 });
    }

    await supabaseRestRequest(`/call_recording_chunk?recording_id=eq.${encodeURIComponent(id)}&sequence=eq.${sequence}`, {
      method: "PATCH",
      accessToken: session.accessToken,
      body: { transcript: processed.transcript },
    });
    if (processed.transcript && recording.case_id) {
      await supabaseRestRequest("/transcript_segment", {
        method: "POST",
        accessToken: session.accessToken,
        body: [{ case_id: recording.case_id, speaker: "caller", transcript: processed.transcript, language: "mixed", status: "final" }],
      });
    }
    if (recording.case_id) {
      await supabaseRestRequest("/assessment", {
        method: "POST",
        accessToken: session.accessToken,
        body: [{ case_id: recording.case_id, provider: processed.assessment.provider, policy_version: processed.triage.policyVersion, output: { assessment: processed.assessment, triage: processed.triage } }],
      });
    }
    const finalChunk = isTrue(form?.get("isFinal") ?? null);
    const status = finalChunk ? "ready" : "processing";
    await supabaseRestRequest(`/call_recording?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      accessToken: session.accessToken,
      body: { status, duration_ms: durationMs, ...(finalChunk ? { completed_at: new Date().toISOString() } : {}) },
    });

    const result: RecordingChunkResult = { recordingId: id, sequence, transcript: processed.transcript || null, nextPrompt: processed.nextPrompt, status };
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to store or process audio." }, { status: 502 });
  }
}
