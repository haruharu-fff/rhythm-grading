import { describe, expect, it } from "vitest";
import { assessRecordingQuality } from "../src/audio";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config";
import type { DetectedStroke, RecordingMetadata } from "../src/domain";

function metadata(
  overrides: Partial<RecordingMetadata> = {},
): RecordingMetadata {
  return {
    schemaVersion: "1.0",
    sampleRate: 48_000,
    channelCount: 1,
    frameCount: 48_000,
    durationSec: 1,
    requestedConstraints: {},
    appliedSettings: {
      autoGainControl: false,
      noiseSuppression: false,
      echoCancellation: false,
    },
    clippingSampleRatio: 0,
    peakAbs: 0.5,
    rmsDbfs: -24,
    startedAt: "2026-09-03T00:00:00.000Z",
    ...overrides,
  };
}

const weakStroke: DetectedStroke = {
  id: "weak",
  sampleIndex: 100,
  timeSec: 100 / 48_000,
  attackStrengthDbfs: -60,
  strokeEnergyDbfs: -62,
  relativeAttackDb: null,
  relativeEnergyDb: null,
  confidence: 0.2,
  flags: ["weak-signal"],
};

describe("recording quality", () => {
  it("keeps clean explicitly-disabled settings as ok", () => {
    expect(
      assessRecordingQuality(
        metadata(),
        [],
        DEFAULT_ANALYSIS_CONFIG.quality,
        DEFAULT_ANALYSIS_CONFIG.onset.confidenceThreshold,
      ),
    ).toEqual({ status: "ok", reasonCodes: [] });
  });

  it("does not assume requested browser processing was actually disabled", () => {
    const result = assessRecordingQuality(
      metadata({
        appliedSettings: {
          autoGainControl: true,
          noiseSuppression: undefined,
          echoCancellation: true,
        },
        clippingSampleRatio: 0.01,
        rmsDbfs: -70,
      }),
      [weakStroke, { ...weakStroke, id: "weak-2" }],
      DEFAULT_ANALYSIS_CONFIG.quality,
      DEFAULT_ANALYSIS_CONFIG.onset.confidenceThreshold,
    );
    expect(result.status).toBe("low-confidence");
    expect(result.reasonCodes).toEqual([
      "automatic-gain-control-not-disabled",
      "noise-suppression-not-disabled",
      "echo-cancellation-not-disabled",
      "clipping-ratio-too-high",
      "input-level-too-low",
      "mostly-low-confidence-detections",
    ]);
  });
});
