import goldenScore from "../../../fixtures/scores/phase2-golden-score.json";
import { describe, expect, it } from "vitest";
import { validateScoreDocument } from "../src/score";

describe("ScoreDocument validation", () => {
  it("normalizes every Fraction while reading JSON", () => {
    const input = structuredClone(goldenScore) as Record<string, unknown>;
    input.lengthBeats = { numerator: 16, denominator: 2 };
    const result = validateScoreDocument(input);
    expect(result.valid).toBe(true);
    if (result.valid)
      expect(result.value.lengthBeats).toEqual({
        numerator: 8,
        denominator: 1,
      });
  });

  it("reports duplicate ids, out-of-range values, and conflicting dynamics", () => {
    const input = structuredClone(goldenScore) as Record<string, unknown>;
    const strokes = input.strokes as Array<Record<string, unknown>>;
    strokes[1]!.id = strokes[0]!.id;
    strokes[1]!.beat = { numerator: 9, denominator: 1 };
    const regions = input.regions as Array<Record<string, unknown>>;
    regions.push({
      id: "decrescendo-conflict",
      type: "decrescendo",
      startBeat: { numerator: 1, denominator: 1 },
      endBeat: { numerator: 3, denominator: 1 },
      curve: "linear",
    });
    const result = validateScoreDocument(input);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.map((entry) => entry.code)).toEqual(
        expect.arrayContaining([
          "duplicate-id",
          "out-of-range",
          "conflicting-dynamics",
        ]),
      );
    }
  });

  it("requires measured roll subdivision but does not require it for unmeasured rolls", () => {
    const input = structuredClone(goldenScore) as Record<string, unknown>;
    const regions = input.regions as Array<Record<string, unknown>>;
    delete regions.find((region) => region.id === "roll-measured")!.subdivision;
    const result = validateScoreDocument(input);
    expect(result.valid).toBe(false);
    if (!result.valid)
      expect(result.issues.some((entry) => entry.code === "required")).toBe(
        true,
      );
  });
});
