import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import expectedStrokes from "../../../fixtures/performances/phase4-synthetic-detected.json";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config";
import { detectOnsets } from "../src/dsp";
import { medianFilterNearest } from "../src/dsp/sliding-median";
import { decodeMonoPcm16Wav } from "./wav";

describe("TypeScript onset detector", () => {
  it("matches the Phase 4 Python shared PCM golden", () => {
    const audio = decodeMonoPcm16Wav(
      resolve(process.cwd(), "../../fixtures/audio/phase4-synthetic.wav"),
    );
    const result = detectOnsets(
      audio.samples,
      audio.sampleRate,
      DEFAULT_ANALYSIS_CONFIG.onset,
    );

    expect(result.strokes).toHaveLength(expectedStrokes.length);
    for (const [index, stroke] of result.strokes.entries()) {
      const expected = expectedStrokes[index]!;
      expect(stroke.sampleIndex).toBeCloseTo(expected.sampleIndex, 0);
      expect(stroke.attackStrengthDbfs).toBeCloseTo(
        expected.attackStrengthDbfs,
        5,
      );
      expect(stroke.strokeEnergyDbfs).toBeCloseTo(expected.strokeEnergyDbfs, 5);
    }
  });

  it("returns no strokes for silence", () => {
    const result = detectOnsets(
      new Float32Array(8_000),
      16_000,
      DEFAULT_ANALYSIS_CONFIG.onset,
    );
    expect(result.strokes).toEqual([]);
  });
});

describe("medianFilterNearest", () => {
  it("uses nearest-value boundary extension", () => {
    expect([...medianFilterNearest(Float64Array.of(3, 1, 8, 2), 3)]).toEqual([
      3, 3, 2, 2,
    ]);
  });
});
