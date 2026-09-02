import gridScore from "../../../fixtures/scores/all-grid-divisions.json";
import goldenScore from "../../../fixtures/scores/phase2-golden-score.json";
import { describe, expect, it } from "vitest";
import type { ScoreDocument } from "../src/domain";
import {
  compileTempoMap,
  scoreCompiler,
  validateScoreDocument,
} from "../src/score";
import { makeScore } from "./helpers";

function validated(value: unknown): ScoreDocument {
  const result = validateScoreDocument(value);
  if (!result.valid) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

describe("ScoreCompiler", () => {
  it("compiles 4/8/12/16/24/32 division positions exactly", () => {
    const performance = scoreCompiler.compile(validated(gridScore));
    expect(performance.strokes.map((stroke) => stroke.timeSec)).toEqual([
      1 / 8,
      1 / 6,
      1 / 4,
      1 / 3,
      1 / 2,
      1,
    ]);
  });

  it("integrates across tempo changes and supports inverse lookup", () => {
    const score = makeScore({
      lengthBeats: { numerator: 4, denominator: 1 },
      tempoChanges: [{ beat: { numerator: 2, denominator: 1 }, bpm: 60 }],
      strokes: [
        {
          id: "after",
          beat: { numerator: 3, denominator: 1 },
          hand: "R",
          accent: false,
        },
      ],
    });
    const performance = scoreCompiler.compile(score);
    expect(performance.strokes[0]!.timeSec).toBe(2);
    expect(performance.durationSec).toBe(3);
    expect(compileTempoMap(score).secondsToBeatPosition(2)).toBe(3);
  });

  it("expands measured rolls, preserves explicit strokes, and does not expand unmeasured rolls", () => {
    const performance = scoreCompiler.compile(validated(goldenScore));
    expect(
      performance.strokes
        .filter((stroke) => stroke.origin === "measured-roll")
        .map((stroke) => stroke.id),
    ).toEqual([
      "roll:roll-measured:5/2",
      "roll:roll-measured:3/1",
      "roll:roll-measured:7/2",
    ]);
    expect(
      performance.strokes.some(
        (stroke) => stroke.id === "roll:roll-measured:2/1",
      ),
    ).toBe(false);
    expect(
      performance.strokes.some(
        (stroke) => stroke.sourceRegionId === "roll-free",
      ),
    ).toBe(false);
    expect(
      performance.regions.find((region) => region.id === "region:roll-free"),
    ).toMatchObject({
      type: "roll",
      mode: "unmeasured",
    });
  });

  it("is independent of input array order", () => {
    const score = validated(goldenScore);
    const reversed: ScoreDocument = {
      ...score,
      strokes: [...score.strokes].reverse(),
      regions: [...score.regions].reverse(),
      tempoChanges: [...score.tempoChanges].reverse(),
    };
    expect(scoreCompiler.compile(reversed)).toEqual(
      scoreCompiler.compile(score),
    );
  });
});
