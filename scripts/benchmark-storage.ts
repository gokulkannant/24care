import { recordingChunkPath } from "../lib/storage-path";

const iterations = 100_000;
let checksum = 0;
const startedAt = performance.now();

for (let index = 0; index < iterations; index += 1) {
  const path = recordingChunkPath(`patient-${index % 31}/recording-${index % 997}`, index, index % 3 === 0 ? "audio/ogg" : "audio/webm;codecs=opus");
  checksum = (checksum + path.charCodeAt(index % path.length)) % 1_000_000_007;
}

const elapsedMs = performance.now() - startedAt;
console.log(`METRIC storage_key_generation_ms=${elapsedMs.toFixed(3)}`);
console.log(`METRIC storage_keys_generated=${iterations}`);
console.log(`ASI checksum=${checksum}`);
