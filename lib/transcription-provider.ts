import type { TranscriptSegment } from "./types";

export interface TranscriptionCallbacks {
  onSegment: (segment: TranscriptSegment) => void;
  onStatus?: (status: "connecting" | "live" | "stopped" | "error") => void;
}

export interface TranscriptionSession {
  stop: () => Promise<void>;
}

export interface TranscriptionProvider {
  id: string;
  label: string;
  start: (callbacks: TranscriptionCallbacks) => Promise<TranscriptionSession>;
}

/**
 * Browser-safe demo adapter. It deliberately does not transmit any audio.
 * Replace it with a server-authenticated provider gateway after IPM approval.
 */
export class SimulatedTranscriptionProvider implements TranscriptionProvider {
  id = "simulated";
  label = "Simulation (no audio leaves this browser)";
  private timer: ReturnType<typeof setTimeout> | undefined;

  async start(callbacks: TranscriptionCallbacks): Promise<TranscriptionSession> {
    callbacks.onStatus?.("connecting");
    callbacks.onStatus?.("live");

    this.timer = setTimeout(() => {
      callbacks.onSegment({
        id: crypto.randomUUID(),
        text: "The scripted caller says: the pain has increased, and the supplies are low.",
        status: "final",
        language: "mixed",
        createdAt: new Date().toISOString(),
      });
    }, 800);

    return {
      stop: async () => {
        if (this.timer) clearTimeout(this.timer);
        callbacks.onStatus?.("stopped");
      },
    };
  }
}
