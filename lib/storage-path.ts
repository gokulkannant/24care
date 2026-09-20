export function recordingChunkPath(storagePrefix: string, sequence: number, contentType: string) {
  const extension = contentType.includes("ogg") ? "ogg" : contentType.includes("mp4") ? "mp4" : "webm";
  return `${storagePrefix}/${sequence.toString().padStart(8, "0")}.${extension}`;
}
