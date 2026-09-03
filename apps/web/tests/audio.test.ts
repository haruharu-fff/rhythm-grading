import { describe, expect, it } from "vitest";
import { createPcmRecording, pcmLevelStatistics } from "../src/audio";
import type { AudioSourceInfo } from "../src/domain";

const info: AudioSourceInfo = {
  sampleRate: 1_000,
  channelCount: 1,
  requestedConstraints: {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
  appliedSettings: {
    channelCount: 1,
    sampleRate: 1_000,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
};

describe("PCM recording metadata", () => {
  it("computes frame, clipping, peak, duration, and RMS from PCM", () => {
    const samples = Float32Array.of(0, 0.5, -1, 0.5);
    const recording = createPcmRecording(
      samples,
      info,
      "2026-09-03T00:00:00.000Z",
      -0.25,
    );
    expect(recording.metadata.frameCount).toBe(4);
    expect(recording.metadata.durationSec).toBe(0.004);
    expect(recording.metadata.peakAbs).toBe(1);
    expect(recording.metadata.clippingSampleRatio).toBe(0.25);
    expect(recording.metadata.rmsDbfs).toBeCloseTo(-4.2597, 3);
  });

  it("uses a finite floor for silence", () => {
    expect(pcmLevelStatistics(new Float32Array(20), 0.99).rmsDbfs).toBe(-160);
  });
});
