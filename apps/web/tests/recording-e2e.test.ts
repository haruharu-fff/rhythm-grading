import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import expectedStrokes from "../../../fixtures/performances/phase4-synthetic-detected.json";
import { createPcmRecording } from "../src/audio";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config";
import type { TargetPerformance } from "../src/domain";
import { detectOnsets, type OfflineOnsetDetector } from "../src/dsp";
import { analyzeRecording } from "../src/session";
import { decodeMonoPcm16Wav } from "./wav";

describe("fake PCM recording pipeline", () => {
  it("runs capture-equivalent PCM through detection, matching, evaluation, and waveform output", async () => {
    const audio = decodeMonoPcm16Wav(
      resolve(process.cwd(), "../../fixtures/audio/phase4-synthetic.wav"),
    );
    const recording = createPcmRecording(
      audio.samples,
      {
        sampleRate: audio.sampleRate,
        channelCount: 1,
        requestedConstraints: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        appliedSettings: {
          sampleRate: audio.sampleRate,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      },
      "2026-09-03T00:00:00.000Z",
      DEFAULT_ANALYSIS_CONFIG.onset.nearClippingThresholdDbfs,
    );
    const target: TargetPerformance = {
      scoreId: "phase5-fake-pcm",
      durationSec: recording.metadata.durationSec,
      strokes: expectedStrokes.map((stroke, index) => ({
        id: `target-${index}`,
        beat: { numerator: index, denominator: 1 },
        timeSec: stroke.timeSec,
        hand: index % 2 === 0 ? "R" : "L",
        accent: false,
        origin: "stroke",
      })),
      regions: [],
      tempoMap: [
        {
          startBeat: { numerator: 0, denominator: 1 },
          endBeat: { numerator: expectedStrokes.length, denominator: 1 },
          startTimeSec: 0,
          endTimeSec: recording.metadata.durationSec,
          bpm: 120,
        },
      ],
    };
    const detector: OfflineOnsetDetector = {
      detect: (samples, sampleRate, config) =>
        Promise.resolve(detectOnsets(samples, sampleRate, config).strokes),
      dispose: () => undefined,
    };

    const analysis = await analyzeRecording(
      target,
      recording,
      detector,
      DEFAULT_ANALYSIS_CONFIG,
      {
        sessionId: "fake-session",
        generatedAt: "2026-09-03T00:00:01.000Z",
      },
    );

    expect(analysis.detected).toHaveLength(7);
    expect(analysis.result.alignment.matches).toHaveLength(7);
    expect(analysis.result.alignment.misses).toEqual([]);
    expect(analysis.result.alignment.extras).toEqual([]);
    expect(analysis.result.timing.status).toBe("ok");
    expect(analysis.result.quality).toEqual({ status: "ok", reasonCodes: [] });
    expect(analysis.result.recording.frameCount).toBe(audio.samples.length);
    expect(analysis.waveform.minimums.length).toBeGreaterThan(0);
    expect(analysis.waveform.minimums.length).toBeLessThanOrEqual(4096);
  });
});
