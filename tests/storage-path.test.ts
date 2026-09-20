import assert from "node:assert/strict";
import test from "node:test";
import { recordingChunkPath } from "../lib/storage-path";

test("recording chunk keys are deterministic and sequence ordered", () => {
  assert.equal(recordingChunkPath("patient/recording", 7, "audio/webm;codecs=opus"), "patient/recording/00000007.webm");
  assert.equal(recordingChunkPath("patient/recording", 42, "audio/ogg"), "patient/recording/00000042.ogg");
  assert.equal(recordingChunkPath("patient/recording", 3, "audio/mp4"), "patient/recording/00000003.mp4");
});
