import type { DistributionStats } from "../domain";

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number {
  return quantile(values, 0.5);
}

export function quantile(values: number[], probability: number): number {
  if (values.length === 0)
    throw new RangeError("Cannot calculate a quantile of an empty array");
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return (
    (sorted[lower] ?? 0) * (1 - fraction) + (sorted[upper] ?? 0) * fraction
  );
}

export function standardDeviation(values: number[]): number {
  const center = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - center) ** 2)));
}

export function distributionStats(values: number[]): DistributionStats | null {
  if (values.length === 0) return null;
  const absolute = values.map(Math.abs);
  return {
    count: values.length,
    mean: mean(values),
    median: median(values),
    standardDeviation: standardDeviation(values),
    meanAbsolute: mean(absolute),
    medianAbsolute: median(absolute),
    p95Absolute: quantile(absolute, 0.95),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  };
}

export function linearRegression(
  pairs: Array<{ x: number; y: number }>,
): { intercept: number; slope: number } | null {
  if (pairs.length < 2) return null;
  const meanX = mean(pairs.map((pair) => pair.x));
  const meanY = mean(pairs.map((pair) => pair.y));
  const variance = pairs.reduce((sum, pair) => sum + (pair.x - meanX) ** 2, 0);
  if (variance <= Number.EPSILON) return null;
  const covariance = pairs.reduce(
    (sum, pair) => sum + (pair.x - meanX) * (pair.y - meanY),
    0,
  );
  const slope = covariance / variance;
  return { slope, intercept: meanY - slope * meanX };
}

function ranks(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }));
  indexed.sort(
    (left, right) => left.value - right.value || left.index - right.index,
  );
  const result = Array<number>(values.length);
  let start = 0;
  while (start < indexed.length) {
    let end = start + 1;
    while (
      end < indexed.length &&
      indexed[end]!.value === indexed[start]!.value
    )
      end += 1;
    const averageRank = (start + end - 1) / 2;
    for (let index = start; index < end; index += 1)
      result[indexed[index]!.index] = averageRank;
    start = end;
  }
  return result;
}

export function spearmanCorrelation(
  pairs: Array<{ x: number; y: number }>,
): number | null {
  if (pairs.length < 2) return null;
  const xRanks = ranks(pairs.map((pair) => pair.x));
  const yRanks = ranks(pairs.map((pair) => pair.y));
  const xMean = mean(xRanks);
  const yMean = mean(yRanks);
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    const x = xRanks[index]! - xMean;
    const y = yRanks[index]! - yMean;
    numerator += x * y;
    xVariance += x * x;
    yVariance += y * y;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator <= Number.EPSILON ? null : numerator / denominator;
}
