import type {
  AccentEvaluation,
  DetectedStroke,
  DistributionStats,
  DynamicRegionEvaluation,
  DynamicsEvaluation,
  DynamicsEvaluationConfig,
  GroupStats,
  PerformanceEvaluation,
  RhythmEvaluation,
  RollEvaluation,
  RollEvaluationConfig,
  StrokeAlignment,
  TargetDynamicRegion,
  TargetPerformance,
  TargetRollRegion,
  TargetStroke,
  TempoEvaluation,
  TimingEvaluation,
  TimingEvaluationConfig,
} from "../domain";
import {
  distributionStats,
  linearRegression,
  median,
  quantile,
  spearmanCorrelation,
  standardDeviation,
} from "./statistics";

function groupValues(
  entries: Array<{ key: string; strokeId: string; value: number }>,
): GroupStats[] {
  const groups = new Map<string, Array<{ strokeId: string; value: number }>>();
  for (const entry of entries) {
    const group = groups.get(entry.key) ?? [];
    group.push({ strokeId: entry.strokeId, value: entry.value });
    groups.set(entry.key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => ({
      key,
      strokeIds: values.map((value) => value.strokeId),
      stats: distributionStats(values.map((value) => value.value))!,
    }));
}

function selectedDynamicValue(
  stroke: DetectedStroke,
  metric: DynamicsEvaluationConfig["metric"],
): number | null {
  return metric === "relativeAttackDb"
    ? stroke.relativeAttackDb
    : stroke.relativeEnergyDb;
}

function makeTimingEvaluation(
  targetById: Map<string, TargetStroke>,
  detectedById: Map<string, DetectedStroke>,
  alignment: StrokeAlignment,
  config: TimingEvaluationConfig,
): TimingEvaluation {
  const perStroke = alignment.matches.map((match) => ({
    targetStrokeId: match.targetStrokeId,
    detectedStrokeId: match.detectedStrokeId,
    errorSec:
      match.detectedTimeSec -
      alignment.estimatedOffsetSec -
      match.targetTimeSec,
  }));
  const errors = perStroke.map((stroke) => stroke.errorSec);
  const toleranceSec = config.withinToleranceMs / 1000;
  return {
    status: errors.length > 0 ? "ok" : "insufficient-data",
    reasonCodes: errors.length > 0 ? [] : ["no-matched-strokes"],
    toleranceMs: config.withinToleranceMs,
    perStroke,
    stats: distributionStats(errors),
    earlyRate:
      errors.length === 0
        ? null
        : errors.filter((error) => error < 0).length / errors.length,
    lateRate:
      errors.length === 0
        ? null
        : errors.filter((error) => error > 0).length / errors.length,
    withinToleranceRate:
      errors.length === 0
        ? null
        : errors.filter((error) => Math.abs(error) <= toleranceSec).length /
          errors.length,
    byHand: groupValues(
      perStroke.map((item) => ({
        key: targetById.get(item.targetStrokeId)?.hand ?? "unspecified",
        strokeId: item.targetStrokeId,
        value: item.errorSec,
      })),
    ),
    byAccent: groupValues(
      perStroke.map((item) => ({
        key:
          targetById.get(item.targetStrokeId)?.accent === true
            ? "accent"
            : "normal",
        strokeId: item.targetStrokeId,
        value: item.errorSec,
      })),
    ),
  };
}

function timeScaleForMatches(
  matches: StrokeAlignment["matches"],
): { timeScale: number; actualPairs: number } | null {
  const fit = linearRegression(
    matches.map((match) => ({
      x: match.targetTimeSec,
      y: match.detectedTimeSec,
    })),
  );
  return fit === null
    ? null
    : { timeScale: fit.slope, actualPairs: matches.length };
}

function makeTempoEvaluation(
  target: TargetPerformance,
  alignment: StrokeAlignment,
): TempoEvaluation {
  const segments = target.tempoMap.map((segment, segmentIndex) => {
    const matches = alignment.matches.filter(
      (match) =>
        match.targetTimeSec >= segment.startTimeSec &&
        match.targetTimeSec < segment.endTimeSec,
    );
    const fit = timeScaleForMatches(matches);
    return {
      segmentIndex,
      targetBpm: segment.bpm,
      matchedStrokeIds: matches.map((match) => match.targetStrokeId),
      timeScale: fit?.timeScale ?? null,
      actualBpm:
        fit === null || fit.timeScale === 0
          ? null
          : segment.bpm / fit.timeScale,
    };
  });
  const enough = alignment.matches.length >= 2;
  return {
    status: enough ? "ok" : "insufficient-data",
    reasonCodes: enough ? [] : ["fewer-than-two-matches"],
    overallTimeScale: enough ? alignment.estimatedTimeScale : null,
    overallActualBpm:
      enough && target.tempoMap.length === 1
        ? target.tempoMap[0]!.bpm / alignment.estimatedTimeScale
        : null,
    segments,
  };
}

function makeRhythmEvaluation(
  targetById: Map<string, TargetStroke>,
  alignment: StrokeAlignment,
): RhythmEvaluation {
  const perStroke = alignment.matches.map((match) => ({
    targetStrokeId: match.targetStrokeId,
    detectedStrokeId: match.detectedStrokeId,
    residualSec:
      match.detectedTimeSec -
      (alignment.estimatedOffsetSec +
        alignment.estimatedTimeScale * match.targetTimeSec),
  }));
  const ioiErrors: number[] = [];
  for (let index = 1; index < alignment.matches.length; index += 1) {
    const previous = alignment.matches[index - 1]!;
    const current = alignment.matches[index]!;
    ioiErrors.push(
      current.detectedTimeSec -
        previous.detectedTimeSec -
        alignment.estimatedTimeScale *
          (current.targetTimeSec - previous.targetTimeSec),
    );
  }
  return {
    status: perStroke.length >= 2 ? "ok" : "insufficient-data",
    reasonCodes: perStroke.length >= 2 ? [] : ["fewer-than-two-matches"],
    perStroke,
    residualStats: distributionStats(
      perStroke.map((stroke) => stroke.residualSec),
    ),
    interOnsetIntervalErrorStats: distributionStats(ioiErrors),
    byHand: groupValues(
      perStroke.map((item) => ({
        key: targetById.get(item.targetStrokeId)?.hand ?? "unspecified",
        strokeId: item.targetStrokeId,
        value: item.residualSec,
      })),
    ),
  };
}

interface DynamicEntry {
  target: TargetStroke;
  detected: DetectedStroke;
  value: number;
}

function dynamicEntries(
  targetById: Map<string, TargetStroke>,
  detectedById: Map<string, DetectedStroke>,
  alignment: StrokeAlignment,
  config: DynamicsEvaluationConfig,
): {
  included: DynamicEntry[];
  excludedClipped: number;
  excludedLowConfidence: number;
} {
  const included: DynamicEntry[] = [];
  let excludedClipped = 0;
  let excludedLowConfidence = 0;
  for (const match of alignment.matches) {
    const targetStroke = targetById.get(match.targetStrokeId);
    const detectedStroke = detectedById.get(match.detectedStrokeId);
    if (targetStroke === undefined || detectedStroke === undefined) continue;
    if (detectedStroke.flags.includes("near-clipping")) {
      excludedClipped += 1;
      continue;
    }
    if (
      detectedStroke.confidence < config.minimumConfidence ||
      detectedStroke.flags.includes("weak-signal")
    ) {
      excludedLowConfidence += 1;
      continue;
    }
    const value = selectedDynamicValue(detectedStroke, config.metric);
    if (value !== null)
      included.push({ target: targetStroke, detected: detectedStroke, value });
  }
  return { included, excludedClipped, excludedLowConfidence };
}

function makeDynamicsEvaluation(
  entries: ReturnType<typeof dynamicEntries>,
  config: DynamicsEvaluationConfig,
): DynamicsEvaluation {
  const normal = entries.included.filter((entry) => !entry.target.accent);
  const reasons: string[] = [];
  if (entries.included.length === 0)
    reasons.push("no-usable-relative-dynamics");
  if (entries.excludedClipped > 0) reasons.push("clipped-strokes-excluded");
  if (entries.excludedLowConfidence > 0)
    reasons.push("low-confidence-strokes-excluded");
  return {
    status:
      entries.included.length === 0
        ? "insufficient-data"
        : entries.excludedLowConfidence > entries.included.length
          ? "low-confidence"
          : "ok",
    reasonCodes: reasons,
    metric: config.metric,
    includedDetectedStrokeIds: entries.included.map(
      (entry) => entry.detected.id,
    ),
    excludedClippedCount: entries.excludedClipped,
    excludedLowConfidenceCount: entries.excludedLowConfidence,
    allStrokeStats: distributionStats(
      entries.included.map((entry) => entry.value),
    ),
    normalStrokeStats: distributionStats(normal.map((entry) => entry.value)),
    byHand: groupValues(
      entries.included.map((entry) => ({
        key: entry.target.hand,
        strokeId: entry.target.id,
        value: entry.value,
      })),
    ),
  };
}

function makeAccentEvaluation(
  entries: DynamicEntry[],
  target: TargetPerformance,
  neighborCount: number,
): AccentEvaluation {
  const usableByTarget = new Map(
    entries.map((entry) => [entry.target.id, entry]),
  );
  const targetOrder = target.strokes.map((stroke) => stroke.id);
  const accents = entries
    .filter((entry) => entry.target.accent)
    .flatMap((entry) => {
      const position = targetOrder.indexOf(entry.target.id);
      const neighbors = entries
        .filter((candidate) => !candidate.target.accent)
        .sort((left, right) => {
          const leftDistance = Math.abs(
            targetOrder.indexOf(left.target.id) - position,
          );
          const rightDistance = Math.abs(
            targetOrder.indexOf(right.target.id) - position,
          );
          return (
            leftDistance - rightDistance ||
            left.target.id.localeCompare(right.target.id)
          );
        })
        .slice(0, neighborCount);
      if (neighbors.length === 0) return [];
      const neighborMedianDb = median(
        neighbors.map((neighbor) => neighbor.value),
      );
      return [
        {
          targetStrokeId: entry.target.id,
          detectedStrokeId: entry.detected.id,
          neighborDetectedStrokeIds: neighbors.map(
            (neighbor) => neighbor.detected.id,
          ),
          accentValueDb: entry.value,
          neighborMedianDb,
          contrastDb: entry.value - neighborMedianDb,
        },
      ];
    });
  const contrasts = accents.map((accent) => accent.contrastDb);
  const normalValues = target.strokes
    .filter((stroke) => !stroke.accent)
    .map((stroke) => usableByTarget.get(stroke.id)?.value)
    .filter((value): value is number => value !== undefined);
  const accentTargetCount = target.strokes.filter(
    (stroke) => stroke.accent,
  ).length;
  return {
    status: accents.length > 0 ? "ok" : "insufficient-data",
    reasonCodes:
      accents.length > 0
        ? []
        : [
            accentTargetCount === 0
              ? "no-accent-targets"
              : "no-nearby-normal-strokes",
          ],
    accents,
    medianContrastDb: contrasts.length === 0 ? null : median(contrasts),
    minimumContrastDb: contrasts.length === 0 ? null : Math.min(...contrasts),
    normalStrokeStats: distributionStats(normalValues),
  };
}

function rollDetectedIds(
  region: TargetRollRegion,
  alignment: StrokeAlignment,
  target: TargetPerformance,
): string[] {
  if (region.mode === "unmeasured") {
    return (
      alignment.rollAssignments.find(
        (assignment) => assignment.regionId === region.id,
      )?.detectedStrokeIds ?? []
    );
  }
  const rollTargetIds = new Set(
    target.strokes
      .filter((stroke) => stroke.sourceRegionId === region.sourceRegionId)
      .map((stroke) => stroke.id),
  );
  return alignment.matches
    .filter((match) => rollTargetIds.has(match.targetStrokeId))
    .map((match) => match.detectedStrokeId);
}

function makeRollEvaluation(
  target: TargetPerformance,
  detectedById: Map<string, DetectedStroke>,
  alignment: StrokeAlignment,
  config: RollEvaluationConfig,
  dynamicMetric: DynamicsEvaluationConfig["metric"],
): RollEvaluation[] {
  return target.regions
    .filter((region): region is TargetRollRegion => region.type === "roll")
    .map((region) => {
      const detectedStrokeIds = rollDetectedIds(region, alignment, target);
      const strokes = detectedStrokeIds
        .map((id) => detectedById.get(id))
        .filter((stroke): stroke is DetectedStroke => stroke !== undefined)
        .sort((left, right) => left.timeSec - right.timeSec);
      const actualStart =
        alignment.estimatedOffsetSec +
        alignment.estimatedTimeScale * region.startTimeSec;
      const actualEnd =
        alignment.estimatedOffsetSec +
        alignment.estimatedTimeScale * region.endTimeSec;
      const duration = actualEnd - actualStart;
      const iois = strokes
        .slice(1)
        .map((stroke, index) => stroke.timeSec - strokes[index]!.timeSec);
      const meanIoi =
        iois.length === 0
          ? null
          : iois.reduce((sum, value) => sum + value, 0) / iois.length;
      const density = duration > 0 ? strokes.length / duration : null;
      const dynamicValues = strokes
        .map((stroke) => selectedDynamicValue(stroke, dynamicMetric))
        .filter((value): value is number => value !== null);
      return {
        regionId: region.id,
        mode: region.mode,
        status:
          strokes.length >= config.minimumStrokeCount
            ? "ok"
            : "insufficient-data",
        reasonCodes:
          strokes.length >= config.minimumStrokeCount
            ? []
            : ["fewer-than-two-roll-strokes"],
        detectedStrokeIds,
        strokeCount: strokes.length,
        densityHz: density,
        targetDensityHz: region.targetDensityHz ?? null,
        densityErrorHz:
          density === null || region.targetDensityHz === undefined
            ? null
            : density - region.targetDensityHz,
        meanIoiSec: meanIoi,
        ioiStandardDeviationSec:
          iois.length === 0 ? null : standardDeviation(iois),
        ioiCv:
          iois.length === 0 || meanIoi === null || meanIoi === 0
            ? null
            : standardDeviation(iois) / meanIoi,
        p95IoiSec: iois.length === 0 ? null : quantile(iois, 0.95),
        maximumGapSec: iois.length === 0 ? null : Math.max(...iois),
        leadingGapSec:
          strokes.length === 0
            ? null
            : Math.max(0, strokes[0]!.timeSec - actualStart),
        trailingGapSec:
          strokes.length === 0
            ? null
            : Math.max(0, actualEnd - strokes[strokes.length - 1]!.timeSec),
        relativeDbStandardDeviation:
          dynamicValues.length === 0 ? null : standardDeviation(dynamicValues),
      };
    });
}

function makeDynamicRegionEvaluation(
  target: TargetPerformance,
  entries: DynamicEntry[],
): DynamicRegionEvaluation[] {
  return target.regions
    .filter((region): region is TargetDynamicRegion => region.type !== "roll")
    .map((region) => {
      const duration = region.endTimeSec - region.startTimeSec;
      const regionEntries = entries
        .filter(
          (entry) =>
            entry.target.timeSec >= region.startTimeSec &&
            entry.target.timeSec <= region.endTimeSec,
        )
        .sort((left, right) => left.target.timeSec - right.target.timeSec);
      const pairs = regionEntries.map((entry) => ({
        x: (entry.target.timeSec - region.startTimeSec) / duration,
        y: entry.value,
      }));
      const regression = linearRegression(pairs);
      const endpointDifference =
        pairs.length < 2 ? null : pairs[pairs.length - 1]!.y - pairs[0]!.y;
      const expectedSign = region.type === "crescendo" ? 1 : -1;
      return {
        regionId: region.id,
        type: region.type,
        status: pairs.length >= 2 ? "ok" : "insufficient-data",
        reasonCodes:
          pairs.length >= 2 ? [] : ["fewer-than-two-dynamic-strokes"],
        detectedStrokeIds: regionEntries.map((entry) => entry.detected.id),
        slopeDbPerNormalizedTime: regression?.slope ?? null,
        spearmanCorrelation: spearmanCorrelation(pairs),
        endpointDifferenceDb: endpointDifference,
        directionCorrect:
          regression === null
            ? null
            : Math.sign(regression.slope) === expectedSign,
      };
    });
}

export function evaluatePerformance(
  target: TargetPerformance,
  detected: DetectedStroke[],
  alignment: StrokeAlignment,
  config: {
    timing: TimingEvaluationConfig;
    dynamics: DynamicsEvaluationConfig;
    roll: RollEvaluationConfig;
  },
): PerformanceEvaluation {
  const targetById = new Map(
    target.strokes.map((stroke) => [stroke.id, stroke]),
  );
  const detectedById = new Map(detected.map((stroke) => [stroke.id, stroke]));
  const entries = dynamicEntries(
    targetById,
    detectedById,
    alignment,
    config.dynamics,
  );
  return {
    timing: makeTimingEvaluation(
      targetById,
      detectedById,
      alignment,
      config.timing,
    ),
    tempo: makeTempoEvaluation(target, alignment),
    internalRhythm: makeRhythmEvaluation(targetById, alignment),
    dynamics: makeDynamicsEvaluation(entries, config.dynamics),
    accents: makeAccentEvaluation(
      entries.included,
      target,
      config.dynamics.accentNeighborCount,
    ),
    rolls: makeRollEvaluation(
      target,
      detectedById,
      alignment,
      config.roll,
      config.dynamics.metric,
    ),
    dynamicRegions: makeDynamicRegionEvaluation(target, entries.included),
  };
}

export type { DistributionStats };
