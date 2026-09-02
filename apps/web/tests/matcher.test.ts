import { describe, expect, it } from "vitest";
import { generateSyntheticDetectedStrokes } from "../src/fixtures/synthetic-performance";
import { matchPerformance } from "../src/matching";
import { scoreCompiler } from "../src/score";
import { makeScore, matcherConfig } from "./helpers";

describe("DP matcher", () => {
  it("matches a perfect performance and estimates a global offset", () => {
    const target = scoreCompiler.compile(makeScore());
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.25,
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(alignment.matches).toHaveLength(target.strokes.length);
    expect(alignment.misses).toEqual([]);
    expect(alignment.extras).toEqual([]);
    expect(alignment.estimatedOffsetSec).toBeCloseTo(0.25, 5);
  });

  it("keeps later pairs aligned after a miss and an extra", () => {
    const target = scoreCompiler.compile(makeScore());
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.2,
      missTargetIds: ["stroke:s2"],
      injectedStrokes: [{ id: "extra-between", timeSec: 1.45 }],
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(alignment.misses.map((miss) => miss.targetStrokeId)).toEqual([
      "stroke:s2",
    ]);
    expect(alignment.extras.map((extra) => extra.detectedStrokeId)).toEqual([
      "extra-between",
    ]);
    expect(alignment.matches.at(-1)).toMatchObject({
      targetStrokeId: "stroke:s7",
      detectedStrokeId: "det:stroke:s7",
    });
  });

  it("recovers after consecutive misses", () => {
    const target = scoreCompiler.compile(makeScore());
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.2,
      missTargetIds: ["stroke:s2", "stroke:s3"],
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(alignment.misses.map((miss) => miss.targetStrokeId)).toEqual([
      "stroke:s2",
      "stroke:s3",
    ]);
    expect(alignment.matches.at(-1)?.targetStrokeId).toBe("stroke:s7");
  });

  it("does not assume that the first target and first detection match", () => {
    const target = scoreCompiler.compile(makeScore());
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.15,
      missTargetIds: ["stroke:s0"],
      injectedStrokes: [{ id: "leading-extra", timeSec: 0.02 }],
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(alignment.misses.map((miss) => miss.targetStrokeId)).toContain(
      "stroke:s0",
    );
    expect(alignment.extras.map((extra) => extra.detectedStrokeId)).toContain(
      "leading-extra",
    );
    expect(alignment.matches[0]).toMatchObject({ targetStrokeId: "stroke:s1" });
  });

  it("separates affine tempo drift from local matching", () => {
    const target = scoreCompiler.compile(makeScore());
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.1,
      timeScale: 1.03,
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(alignment.matches).toHaveLength(target.strokes.length);
    expect(alignment.estimatedOffsetSec).toBeCloseTo(0.1, 3);
    expect(alignment.estimatedTimeScale).toBeCloseTo(1.03, 3);
  });

  it("prefers the closer event when a double trigger is nearby", () => {
    const target = scoreCompiler.compile(
      makeScore({ strokes: makeScore().strokes.slice(0, 3) }),
    );
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.1,
      injectedStrokes: [
        {
          id: "double-trigger",
          timeSec: 0.64,
          confidence: 0.4,
          flags: ["possible-double-trigger"],
        },
      ],
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(
      alignment.matches.find((match) => match.targetStrokeId === "stroke:s1")
        ?.detectedStrokeId,
    ).toBe("det:stroke:s1");
    expect(alignment.extras.map((extra) => extra.detectedStrokeId)).toContain(
      "double-trigger",
    );
  });

  it("matches fast 24-division strokes without index drift", () => {
    const target = scoreCompiler.compile(
      makeScore({
        lengthBeats: { numerator: 2, denominator: 1 },
        initialTempoBpm: 180,
        strokes: Array.from({ length: 12 }, (_, index) => ({
          id: `fast-${index}`,
          beat: { numerator: index, denominator: 6 },
          hand: index % 2 === 0 ? ("R" as const) : ("L" as const),
          accent: false,
        })),
      }),
    );
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.08,
      localErrorSecByTargetId: Object.fromEntries(
        target.strokes.map((stroke, index) => [
          stroke.id,
          index % 2 === 0 ? -0.002 : 0.002,
        ]),
      ),
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    expect(alignment.matches).toHaveLength(12);
    expect(alignment.misses).toEqual([]);
    expect(alignment.extras).toEqual([]);
  });

  it("keeps an unmeasured-roll boundary stroke available to normal DP", () => {
    const target = scoreCompiler.compile(
      makeScore({
        lengthBeats: { numerator: 4, denominator: 1 },
        strokes: [
          {
            id: "boundary",
            beat: { numerator: 2, denominator: 1 },
            hand: "R",
            accent: false,
          },
          {
            id: "after",
            beat: { numerator: 3, denominator: 1 },
            hand: "L",
            accent: false,
          },
        ],
        regions: [
          {
            id: "free",
            type: "roll",
            mode: "unmeasured",
            startBeat: { numerator: 0, denominator: 1 },
            endBeat: { numerator: 2, denominator: 1 },
          },
        ],
      }),
    );
    const detected = generateSyntheticDetectedStrokes(target, {
      offsetSec: 0.1,
      confidenceByTargetId: { "stroke:boundary": 0.2 },
      injectedStrokes: [
        { id: "roll-0", timeSec: 0.2 },
        { id: "roll-1", timeSec: 0.45 },
        { id: "roll-2", timeSec: 0.7 },
      ],
    });
    const alignment = matchPerformance(target, detected, matcherConfig);
    const boundaryMatch = alignment.matches.find(
      (match) => match.targetStrokeId === "stroke:boundary",
    );
    const assigned = alignment.rollAssignments.flatMap(
      (entry) => entry.detectedStrokeIds,
    );
    expect(boundaryMatch?.detectedStrokeId).toBe("det:stroke:boundary");
    expect(assigned).not.toContain("det:stroke:boundary");
    expect(assigned).toEqual(["roll-0", "roll-1", "roll-2"]);
  });
});
