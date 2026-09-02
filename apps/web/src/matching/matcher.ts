import type {
  DetectedStroke,
  ExtraStroke,
  MatcherConfig,
  MissedStroke,
  RollStrokeAssignment,
  StrokeAlignment,
  StrokeMatch,
  TargetPerformance,
  TargetRollRegion,
  TargetStroke,
} from "../domain";

interface DpResult {
  alignment: StrokeAlignment;
  eligibleDetected: DetectedStroke[];
}

const MATCH = 1;
const MISS = 2;
const EXTRA = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function robustLoss(value: number): number {
  const magnitude = Math.abs(value);
  return magnitude <= 1 ? 0.5 * magnitude * magnitude : magnitude - 0.5;
}

function partitionUnmeasuredRollStrokes(
  target: TargetPerformance,
  detected: DetectedStroke[],
  offsetSec: number,
  boundaryMarginSec: number,
): { eligible: DetectedStroke[]; assignments: RollStrokeAssignment[] } {
  const regions = target.regions
    .filter(
      (region): region is TargetRollRegion =>
        region.type === "roll" && region.mode === "unmeasured",
    )
    .sort(
      (left, right) =>
        left.startTimeSec - right.startTimeSec ||
        left.id.localeCompare(right.id),
    );
  const assignedIds = new Set<string>();
  const assignments = regions.map((region) => {
    const duration = region.endTimeSec - region.startTimeSec;
    const margin = Math.min(boundaryMarginSec, duration / 4);
    const start = offsetSec + region.startTimeSec + margin;
    const end = offsetSec + region.endTimeSec - margin;
    const detectedStrokeIds = detected
      .filter(
        (stroke) =>
          !assignedIds.has(stroke.id) &&
          stroke.timeSec >= start &&
          stroke.timeSec < end,
      )
      .map((stroke) => {
        assignedIds.add(stroke.id);
        return stroke.id;
      });
    return { regionId: region.id, detectedStrokeIds };
  });
  return {
    eligible: detected.filter((stroke) => !assignedIds.has(stroke.id)),
    assignments,
  };
}

function runDp(
  targetPerformance: TargetPerformance,
  sortedDetected: DetectedStroke[],
  offsetSec: number,
  config: MatcherConfig,
): DpResult {
  const target = targetPerformance.strokes;
  const partitioned = partitionUnmeasuredRollStrokes(
    targetPerformance,
    sortedDetected,
    offsetSec,
    config.unmeasuredRollBoundaryMarginMs / 1000,
  );
  const detected = partitioned.eligible;
  const width = detected.length + 1;
  const costs = new Float64Array((target.length + 1) * width);
  costs.fill(Number.POSITIVE_INFINITY);
  const back = new Uint8Array(costs.length);
  costs[0] = 0;
  const update = (
    index: number,
    candidate: number,
    transition: number,
  ): void => {
    if (candidate < costs[index]! - 1e-12) {
      costs[index] = candidate;
      back[index] = transition;
    }
  };

  for (let i = 0; i <= target.length; i += 1) {
    for (let j = 0; j <= detected.length; j += 1) {
      const index = i * width + j;
      const current = costs[index]!;
      if (!Number.isFinite(current)) continue;
      if (i < target.length && j < detected.length) {
        const targetStroke = target[i]!;
        const detectedStroke = detected[j]!;
        const errorSec =
          detectedStroke.timeSec - offsetSec - targetStroke.timeSec;
        if (Math.abs(errorSec) <= config.maxMatchDistanceMs / 1000) {
          const timingCost = robustLoss(
            (errorSec * 1000) / config.timingSigmaMs,
          );
          const confidenceCost =
            config.confidencePenaltyWeight * (1 - detectedStroke.confidence);
          update(
            (i + 1) * width + j + 1,
            current + timingCost + confidenceCost,
            MATCH,
          );
        }
      }
      if (i < target.length)
        update((i + 1) * width + j, current + config.missPenalty, MISS);
      if (j < detected.length)
        update(i * width + j + 1, current + config.extraPenalty, EXTRA);
    }
  }

  const matches: StrokeMatch[] = [];
  const misses: MissedStroke[] = [];
  const extras: ExtraStroke[] = [];
  let i = target.length;
  let j = detected.length;
  while (i > 0 || j > 0) {
    const transition = back[i * width + j];
    if (transition === MATCH) {
      const targetStroke = target[i - 1]!;
      const detectedStroke = detected[j - 1]!;
      matches.push({
        targetStrokeId: targetStroke.id,
        detectedStrokeId: detectedStroke.id,
        targetTimeSec: targetStroke.timeSec,
        detectedTimeSec: detectedStroke.timeSec,
        rawTimingErrorSec: detectedStroke.timeSec - targetStroke.timeSec,
        offsetAdjustedErrorSec:
          detectedStroke.timeSec - offsetSec - targetStroke.timeSec,
      });
      i -= 1;
      j -= 1;
    } else if (transition === MISS) {
      const targetStroke = target[i - 1]!;
      misses.push({
        targetStrokeId: targetStroke.id,
        targetTimeSec: targetStroke.timeSec,
      });
      i -= 1;
    } else if (transition === EXTRA) {
      const detectedStroke = detected[j - 1]!;
      extras.push({
        detectedStrokeId: detectedStroke.id,
        detectedTimeSec: detectedStroke.timeSec,
        confidence: detectedStroke.confidence,
        possibleDoubleTrigger: detectedStroke.flags.includes(
          "possible-double-trigger",
        ),
      });
      j -= 1;
    } else {
      throw new Error("Matcher backtracking reached an invalid state");
    }
  }
  matches.reverse();
  misses.reverse();
  extras.reverse();
  return {
    eligibleDetected: detected,
    alignment: {
      matches,
      misses,
      extras,
      rollAssignments: partitioned.assignments,
      estimatedOffsetSec: offsetSec,
      estimatedTimeScale: 1,
      totalCost: costs[target.length * width + detected.length]!,
    },
  };
}

function fitLeastSquares(pairs: Array<{ x: number; y: number }>): {
  intercept: number;
  slope: number;
} {
  if (pairs.length < 2)
    return {
      intercept: pairs.length === 1 ? pairs[0]!.y - pairs[0]!.x : 0,
      slope: 1,
    };
  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
  let covariance = 0;
  let variance = 0;
  for (const pair of pairs) {
    covariance += (pair.x - meanX) * (pair.y - meanY);
    variance += (pair.x - meanX) ** 2;
  }
  const slope = variance <= Number.EPSILON ? 1 : covariance / variance;
  return { intercept: meanY - slope * meanX, slope };
}

function robustAffine(
  matches: StrokeMatch[],
  config: MatcherConfig,
): { intercept: number; slope: number } {
  if (matches.length === 0) return { intercept: 0, slope: 1 };
  if (!config.affineRefinementEnabled || matches.length < 2) {
    return {
      intercept: median(matches.map((match) => match.rawTimingErrorSec)),
      slope: 1,
    };
  }
  const pairs = matches.map((match) => ({
    x: match.targetTimeSec,
    y: match.detectedTimeSec,
  }));
  let fit = fitLeastSquares(pairs);
  const residuals = pairs.map(
    (pair) => pair.y - (fit.intercept + fit.slope * pair.x),
  );
  const center = median(residuals);
  const mad = median(residuals.map((value) => Math.abs(value - center)));
  if (mad > 1e-9) {
    const threshold = 3 * 1.4826 * mad;
    const inliers = pairs.filter(
      (pair) =>
        Math.abs(pair.y - (fit.intercept + fit.slope * pair.x) - center) <=
        threshold,
    );
    if (inliers.length >= 2) fit = fitLeastSquares(inliers);
  }
  const slope = Math.min(
    config.maxTimeScale,
    Math.max(config.minTimeScale, fit.slope),
  );
  return {
    slope,
    intercept: median(pairs.map((pair) => pair.y - slope * pair.x)),
  };
}

function makeOffsetCandidates(
  targets: TargetStroke[],
  detected: DetectedStroke[],
  config: MatcherConfig,
): number[] {
  const limit = config.offsetCandidateWindowSize;
  const rangeSec = config.offsetSearchRangeMs / 1000;
  const candidates = new Set<number>([0]);
  for (const target of targets.slice(0, limit)) {
    for (const stroke of detected.slice(0, limit)) {
      const difference = stroke.timeSec - target.timeSec;
      if (Math.abs(difference) <= rangeSec)
        candidates.add(Math.round(difference * 1e6) / 1e6);
    }
  }
  return [...candidates].sort((left, right) => left - right);
}

export function matchPerformance(
  target: TargetPerformance,
  detectedInput: DetectedStroke[],
  config: MatcherConfig,
): StrokeAlignment {
  const detected = [...detectedInput].sort(
    (left, right) =>
      left.timeSec - right.timeSec || left.id.localeCompare(right.id),
  );
  const candidates = makeOffsetCandidates(target.strokes, detected, config);
  let best: DpResult | null = null;
  let bestNormalizedCost = Number.POSITIVE_INFINITY;
  for (const offset of candidates) {
    const candidate = runDp(target, detected, offset, config);
    const normalizedCost =
      candidate.alignment.totalCost /
      Math.max(1, target.strokes.length + candidate.eligibleDetected.length);
    const isBetter =
      normalizedCost < bestNormalizedCost - 1e-12 ||
      (Math.abs(normalizedCost - bestNormalizedCost) <= 1e-12 &&
        (best === null ||
          candidate.alignment.matches.length > best.alignment.matches.length ||
          (candidate.alignment.matches.length ===
            best.alignment.matches.length &&
            Math.abs(offset) < Math.abs(best.alignment.estimatedOffsetSec))));
    if (isBetter) {
      best = candidate;
      bestNormalizedCost = normalizedCost;
    }
  }
  if (best === null) best = runDp(target, detected, 0, config);
  if (best.alignment.matches.length > 0) {
    const refinedOffset = median(
      best.alignment.matches.map((match) => match.rawTimingErrorSec),
    );
    best = runDp(target, detected, refinedOffset, config);
  }
  const affine = robustAffine(best.alignment.matches, config);
  best.alignment.estimatedOffsetSec = affine.intercept;
  best.alignment.estimatedTimeScale = affine.slope;
  best.alignment.matches = best.alignment.matches.map((match) => ({
    ...match,
    offsetAdjustedErrorSec:
      match.detectedTimeSec -
      best!.alignment.estimatedOffsetSec -
      match.targetTimeSec,
  }));
  return best.alignment;
}
