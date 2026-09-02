import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config";
import type { StrokeAlignment } from "../src/domain";
import { evaluatePerformance } from "../src/evaluation";
import { generateSyntheticDetectedStrokes } from "../src/fixtures/synthetic-performance";
import { matchPerformance } from "../src/matching";
import { scoreCompiler } from "../src/score";
import { makeScore, matcherConfig } from "./helpers";

describe("Evaluator", () => {
  it("uses negative for early, positive for late, and separates affine residuals", () => {
    const target = scoreCompiler.compile(
      makeScore({ strokes: makeScore().strokes.slice(0, 4) }),
    );
    const localErrors: Record<string, number> = {
      "stroke:s0": -0.01,
      "stroke:s1": 0.01,
      "stroke:s2": -0.005,
      "stroke:s3": 0.005,
    };
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.1,
      timeScale: 1.02,
      localErrorSecByTargetId: localErrors,
    });
    const alignment: StrokeAlignment = {
      matches: target.strokes.map((stroke, index) => ({
        targetStrokeId: stroke.id,
        detectedStrokeId: detected[index]!.id,
        targetTimeSec: stroke.timeSec,
        detectedTimeSec: detected[index]!.timeSec,
        rawTimingErrorSec: detected[index]!.timeSec - stroke.timeSec,
        offsetAdjustedErrorSec: detected[index]!.timeSec - 0.1 - stroke.timeSec,
      })),
      misses: [],
      extras: [],
      rollAssignments: [],
      estimatedOffsetSec: 0.1,
      estimatedTimeScale: 1.02,
      totalCost: 0,
    };
    const result = evaluatePerformance(
      target,
      detected,
      alignment,
      DEFAULT_ANALYSIS_CONFIG,
    );
    expect(result.timing.perStroke[0]!.errorSec).toBeLessThan(0);
    expect(result.timing.perStroke.at(-1)!.errorSec).toBeGreaterThan(0);
    expect(result.tempo.overallActualBpm).toBeCloseTo(120 / 1.02, 6);
    expect(
      result.internalRhythm.perStroke.map((stroke) => stroke.residualSec),
    ).toEqual([
      expect.closeTo(-0.01, 5),
      expect.closeTo(0.01, 5),
      expect.closeTo(-0.005, 5),
      expect.closeTo(0.005, 5),
    ]);
  });

  it("computes accent contrast and excludes clipped or low-confidence dynamics", () => {
    const score = makeScore({
      lengthBeats: { numerator: 3, denominator: 1 },
      strokes: [
        {
          id: "normal-before",
          beat: { numerator: 0, denominator: 1 },
          hand: "R",
          accent: false,
        },
        {
          id: "accent",
          beat: { numerator: 1, denominator: 1 },
          hand: "L",
          accent: true,
        },
        {
          id: "normal-after",
          beat: { numerator: 2, denominator: 1 },
          hand: "R",
          accent: false,
        },
      ],
    });
    const target = scoreCompiler.compile(score);
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.1,
      relativeDbByTargetId: {
        "stroke:normal-before": 0,
        "stroke:accent": 6,
        "stroke:normal-after": 0,
      },
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    const result = evaluatePerformance(
      target,
      detected,
      alignment,
      DEFAULT_ANALYSIS_CONFIG,
    );
    expect(result.accents.accents[0]!.contrastDb).toBeCloseTo(6);

    detected[0]!.flags.push("near-clipping");
    detected[2]!.confidence = 0.1;
    const excluded = evaluatePerformance(
      target,
      detected,
      alignment,
      DEFAULT_ANALYSIS_CONFIG,
    );
    expect(excluded.dynamics.excludedClippedCount).toBe(1);
    expect(excluded.dynamics.excludedLowConfidenceCount).toBe(1);
  });

  it("returns roll and monotonic dynamic-region base statistics", () => {
    const score = makeScore({
      lengthBeats: { numerator: 6, denominator: 1 },
      strokes: [
        {
          id: "d0",
          beat: { numerator: 0, denominator: 1 },
          hand: "R",
          accent: false,
        },
        {
          id: "d1",
          beat: { numerator: 1, denominator: 1 },
          hand: "L",
          accent: false,
        },
        {
          id: "d2",
          beat: { numerator: 2, denominator: 1 },
          hand: "R",
          accent: false,
        },
        {
          id: "d3",
          beat: { numerator: 3, denominator: 1 },
          hand: "L",
          accent: false,
        },
      ],
      regions: [
        {
          id: "dyn",
          type: "crescendo",
          startBeat: { numerator: 0, denominator: 1 },
          endBeat: { numerator: 4, denominator: 1 },
          curve: "linear",
        },
        {
          id: "free",
          type: "roll",
          mode: "unmeasured",
          startBeat: { numerator: 4, denominator: 1 },
          endBeat: { numerator: 6, denominator: 1 },
          targetDensityHz: 4,
        },
      ],
    });
    const target = scoreCompiler.compile(score);
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.1,
      relativeDbByTargetId: {
        "stroke:d0": -3,
        "stroke:d1": -1,
        "stroke:d2": 1,
        "stroke:d3": 3,
      },
      injectedStrokes: [
        { id: "r0", timeSec: 2.15 },
        { id: "r1", timeSec: 2.4 },
        { id: "r2", timeSec: 2.65 },
        { id: "r3", timeSec: 2.9 },
      ],
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    const result = evaluatePerformance(
      target,
      detected,
      alignment,
      DEFAULT_ANALYSIS_CONFIG,
    );
    expect(result.dynamicRegions[0]).toMatchObject({
      status: "ok",
      directionCorrect: true,
    });
    expect(result.dynamicRegions[0]!.spearmanCorrelation).toBe(1);
    expect(result.rolls[0]).toMatchObject({ status: "ok", strokeCount: 4 });
    expect(result.rolls[0]!.ioiCv).toBeCloseTo(0);
  });
});
