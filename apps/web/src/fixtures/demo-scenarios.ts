import expected from "../../../../fixtures/expected/phase2-golden-alignment.json";
import performanceConfig from "../../../../fixtures/performances/phase2-golden-performance.json";
import scoreFixture from "../../../../fixtures/scores/phase2-golden-score.json";
import { DEFAULT_ANALYSIS_CONFIG } from "../config";
import type {
  PerformanceEvaluation,
  ScoreDocument,
  StrokeAlignment,
} from "../domain";
import { evaluatePerformance } from "../evaluation";
import { matchPerformance } from "../matching";
import { scoreCompiler, validateScoreDocument } from "../score";
import {
  generateSyntheticDetectedStrokes,
  type SyntheticPerformanceConfig,
} from "./synthetic-performance";
import type { TimelineData } from "../ui/timeline";

export interface DemoScenario {
  id: "golden" | "dense";
  title: string;
  description: string;
  data: TimelineData;
  evaluation: PerformanceEvaluation;
}

export function createGoldenDemoScenario(): DemoScenario {
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
  if (alignment.matches.length !== expected.matchedTargetIds.length) {
    throw new Error(
      "Golden timeline alignment no longer matches its expected fixture",
    );
  }
  const evaluation = evaluatePerformance(
    target,
    detected,
    alignment,
    DEFAULT_ANALYSIS_CONFIG,
  );
  return {
    id: "golden",
    title: validation.value.title,
    description:
      "Tempo change, measured/unmeasured rolls, crescendo, one miss, and one extra.",
    data: { target, detected, alignment },
    evaluation,
  };
}

export function createDenseDemoScenario(strokeCount = 4_000): DemoScenario {
  const timestamp = "2026-09-02T00:00:00.000Z";
  const score: ScoreDocument = {
    schemaVersion: "1.0",
    id: `dense-${strokeCount}`,
    title: `${strokeCount.toLocaleString()}-stroke rendering fixture`,
    createdAt: timestamp,
    updatedAt: timestamp,
    lengthBeats: { numerator: strokeCount + 6, denominator: 6 },
    initialTempoBpm: 180,
    tempoChanges: [],
    timeSignatures: [
      { beat: { numerator: 0, denominator: 1 }, numerator: 4, denominator: 4 },
    ],
    strokes: Array.from({ length: strokeCount }, (_, index) => ({
      id: `dense-${index}`,
      beat: { numerator: index, denominator: 6 },
      hand: index % 2 === 0 ? ("R" as const) : ("L" as const),
      accent: index % 500 === 0,
    })),
    regions: [
      {
        id: "dense-crescendo",
        type: "crescendo",
        startBeat: { numerator: 0, denominator: 1 },
        endBeat: { numerator: 48, denominator: 1 },
        curve: "linear",
      },
      {
        id: "dense-roll",
        type: "roll",
        mode: "measured",
        startBeat: { numerator: 300, denominator: 6 },
        endBeat: { numerator: 360, denominator: 6 },
        subdivision: { numerator: 1, denominator: 6 },
      },
    ],
  };
  const target = scoreCompiler.compile(score);
  const missTargetIds = target.strokes
    .filter((_, index) => index > 0 && index % 503 === 0)
    .map((stroke) => stroke.id);
  const misses = new Set(missTargetIds);
  const localErrorSecByTargetId = Object.fromEntries(
    target.strokes.map((stroke, index) => [
      stroke.id,
      Math.sin(index * 0.37) * 0.009,
    ]),
  );
  const relativeDbByTargetId = Object.fromEntries(
    target.strokes.map((stroke, index) => [
      stroke.id,
      Math.sin(index * 0.05) * 3,
    ]),
  );
  const offsetSec = 0.12;
  const injectedStrokes = target.strokes
    .filter((_, index) => index > 0 && index % 701 === 0)
    .map((stroke, index) => ({
      id: `dense-extra-${index}`,
      timeSec: offsetSec + stroke.timeSec + 0.027,
      confidence: 0.86,
      flags: ["possible-double-trigger" as const],
    }));
  const detected = generateSyntheticDetectedStrokes(target, {
    offsetSec,
    missTargetIds,
    localErrorSecByTargetId,
    relativeDbByTargetId,
    injectedStrokes,
  });
  const detectedById = new Map(detected.map((stroke) => [stroke.id, stroke]));
  const matches = target.strokes
    .filter((stroke) => !misses.has(stroke.id))
    .map((stroke) => {
      const actual = detectedById.get(`det:${stroke.id}`)!;
      return {
        targetStrokeId: stroke.id,
        detectedStrokeId: actual.id,
        targetTimeSec: stroke.timeSec,
        detectedTimeSec: actual.timeSec,
        rawTimingErrorSec: actual.timeSec - stroke.timeSec,
        offsetAdjustedErrorSec: actual.timeSec - offsetSec - stroke.timeSec,
      };
    });
  const alignment: StrokeAlignment = {
    matches,
    misses: target.strokes
      .filter((stroke) => misses.has(stroke.id))
      .map((stroke) => ({
        targetStrokeId: stroke.id,
        targetTimeSec: stroke.timeSec,
      })),
    extras: injectedStrokes.map((stroke) => {
      const actual = detectedById.get(stroke.id)!;
      return {
        detectedStrokeId: actual.id,
        detectedTimeSec: actual.timeSec,
        confidence: actual.confidence,
        possibleDoubleTrigger: true,
      };
    }),
    rollAssignments: [],
    estimatedOffsetSec: offsetSec,
    estimatedTimeScale: 1,
    totalCost: 0,
  };
  const evaluation = evaluatePerformance(
    target,
    detected,
    alignment,
    DEFAULT_ANALYSIS_CONFIG,
  );
  return {
    id: "dense",
    title: score.title,
    description:
      "A UI-only 24-division stress fixture; matching is pre-aligned to avoid testing O(N²) DP here.",
    data: { target, detected, alignment },
    evaluation,
  };
}
