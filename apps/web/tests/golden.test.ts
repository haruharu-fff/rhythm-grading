import expected from "../../../fixtures/expected/phase2-golden-alignment.json";
import performanceConfig from "../../../fixtures/performances/phase2-golden-performance.json";
import scoreFixture from "../../../fixtures/scores/phase2-golden-score.json";
import { describe, expect, it } from "vitest";
import { DEFAULT_ANALYSIS_CONFIG } from "../src/config";
import { evaluatePerformance } from "../src/evaluation";
import {
  generateSyntheticDetectedStrokes,
  type SyntheticPerformanceConfig,
} from "../src/fixtures/synthetic-performance";
import { matchPerformance } from "../src/matching";
import { scoreCompiler, validateScoreDocument } from "../src/score";

describe("Phase 2 golden fixture", () => {
  it("keeps match pairs stable across miss, extra, tempo drift, and an unmeasured roll", () => {
    const validation = validateScoreDocument(scoreFixture);
    if (!validation.valid) throw new Error(JSON.stringify(validation.issues));
    const target = scoreCompiler.compile(validation.value);
    const detected = generateSyntheticDetectedStrokes(
      target,
      performanceConfig as SyntheticPerformanceConfig,
    );
    const alignment = matchPerformance(
      target,
      detected,
      DEFAULT_ANALYSIS_CONFIG.matcher,
    );

    expect(alignment.matches.map((match) => match.targetStrokeId)).toEqual(
      expected.matchedTargetIds,
    );
    expect(alignment.misses.map((miss) => miss.targetStrokeId)).toEqual(
      expected.missTargetIds,
    );
    expect(alignment.extras.map((extra) => extra.detectedStrokeId)).toEqual(
      expected.extraDetectedIds,
    );
    expect(
      alignment.rollAssignments.find(
        (entry) => entry.regionId === "region:roll-free",
      )?.detectedStrokeIds,
    ).toEqual(expected.unmeasuredRollDetectedIds);
    expect(
      Math.abs(alignment.estimatedOffsetSec - expected.expectedOffsetSec),
    ).toBeLessThanOrEqual(expected.tolerance);
    expect(
      Math.abs(alignment.estimatedTimeScale - expected.expectedTimeScale),
    ).toBeLessThanOrEqual(expected.tolerance);

    const evaluation = evaluatePerformance(
      target,
      detected,
      alignment,
      DEFAULT_ANALYSIS_CONFIG,
    );
    expect(evaluation.timing.status).toBe("ok");
    expect(evaluation.internalRhythm.residualStats!.p95Absolute).toBeLessThan(
      0.01,
    );
    expect(
      evaluation.rolls.find((roll) => roll.regionId === "region:roll-free"),
    ).toMatchObject({
      status: "ok",
      strokeCount: 7,
    });
  });
});
