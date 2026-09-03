import type {
  DetectedStroke,
  DetectedStrokeFlag,
  OnsetDetectorConfig,
} from "../domain";
import { medianFilterNearest } from "./sliding-median";

const DB_FLOOR = -160;

export interface OnsetDetectorDiagnostics {
  candidateSamples: number[];
  refinedSamples: number[];
}

export interface OnsetDetectionResult {
  sampleRate: number;
  strokes: DetectedStroke[];
  diagnostics: OnsetDetectorDiagnostics;
}

function samplesForMs(
  milliseconds: number,
  sampleRate: number,
  odd = false,
): number {
  let result = Math.max(1, Math.round((milliseconds * sampleRate) / 1000));
  if (odd && result % 2 === 0) result += 1;
  return result;
}

function validateConfig(config: OnsetDetectorConfig, sampleRate: number): void {
  const positive = [
    config.envelopeWindowMs,
    config.noiseFloorWindowMs,
    config.thresholdOffsetDb,
    config.candidateMinDistanceMs,
    config.refinementLookbackMs,
    config.attackWindowMs,
    config.energyWindowMs,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error(
      "Onset detector window and threshold values must be positive",
    );
  }
  if (
    config.highPassHz !== null &&
    !(config.highPassHz > 0 && config.highPassHz < sampleRate / 2)
  ) {
    throw new Error("highPassHz must be positive and below Nyquist, or null");
  }
  if (config.thresholdMadMultiplier < 0)
    throw new Error("thresholdMadMultiplier must be non-negative");
  if (!(
    config.refinementRiseFraction > 0 && config.refinementRiseFraction < 1
  )) {
    throw new Error("refinementRiseFraction must be between 0 and 1");
  }
  if (config.useSpectralFlux) {
    throw new Error(
      "Spectral flux is reserved for a later calibrated detector",
    );
  }
}

function preprocess(
  samples: Float32Array,
  sampleRate: number,
  config: OnsetDetectorConfig,
): Float64Array {
  let mean = 0;
  for (const sample of samples) mean += sample;
  mean /= samples.length;
  const centered = Float64Array.from(samples, (sample) => sample - mean);
  if (config.highPassHz === null) return centered;

  const warped = Math.tan((Math.PI * config.highPassHz) / sampleRate);
  const normalization = 1 / (1 + Math.SQRT2 * warped + warped * warped);
  const b0 = normalization;
  const b1 = -2 * normalization;
  const b2 = normalization;
  const a1 = 2 * (warped * warped - 1) * normalization;
  const a2 = (1 - Math.SQRT2 * warped + warped * warped) * normalization;
  const filtered = new Float64Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < centered.length; index += 1) {
    const x0 = centered[index]!;
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    filtered[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return filtered;
}

function rmsEnvelope(filtered: Float64Array, windowSize: number): Float64Array {
  const envelope = new Float64Array(filtered.length);
  let squaredSum = 0;
  for (let index = 0; index < filtered.length; index += 1) {
    squaredSum += filtered[index]! * filtered[index]!;
    if (index >= windowSize) {
      squaredSum -=
        filtered[index - windowSize]! * filtered[index - windowSize]!;
    }
    envelope[index] = Math.sqrt(Math.max(0, squaredSum / windowSize));
  }
  return envelope;
}

function amplitudeDb(values: Float64Array): Float64Array {
  return Float64Array.from(values, (value) =>
    Math.max(DB_FLOOR, 20 * Math.log10(Math.max(value, 1e-8))),
  );
}

function adaptiveThreshold(
  envelopeDb: Float64Array,
  windowSize: number,
  config: OnsetDetectorConfig,
): Float64Array {
  const noiseFloor = medianFilterNearest(envelopeDb, windowSize);
  const deviation = Float64Array.from(envelopeDb, (value, index) =>
    Math.abs(value - noiseFloor[index]!),
  );
  const mad = medianFilterNearest(deviation, windowSize);
  return Float64Array.from(noiseFloor, (floor, index) =>
    Math.min(
      0,
      floor +
        Math.max(
          config.thresholdOffsetDb,
          config.thresholdMadMultiplier * 1.4826 * mad[index]!,
        ),
    ),
  );
}

function peakProminence(values: Float64Array, peak: number): number {
  let leftMinimum = values[peak]!;
  for (let index = peak - 1; index >= 0; index -= 1) {
    if (values[index]! > values[peak]!) break;
    leftMinimum = Math.min(leftMinimum, values[index]!);
  }
  let rightMinimum = values[peak]!;
  for (let index = peak + 1; index < values.length; index += 1) {
    if (values[index]! > values[peak]!) break;
    rightMinimum = Math.min(rightMinimum, values[index]!);
  }
  return values[peak]! - Math.max(leftMinimum, rightMinimum);
}

function candidateSamples(
  envelopeDb: Float64Array,
  thresholdDb: Float64Array,
  minimumDistance: number,
  minimumProminence: number,
): number[] {
  const peaks: number[] = [];
  let index = 1;
  while (index + 1 < envelopeDb.length) {
    if (envelopeDb[index]! > envelopeDb[index - 1]!) {
      let plateauEnd = index;
      while (
        plateauEnd + 1 < envelopeDb.length &&
        envelopeDb[plateauEnd + 1] === envelopeDb[index]
      ) {
        plateauEnd += 1;
      }
      if (
        plateauEnd + 1 < envelopeDb.length &&
        envelopeDb[plateauEnd]! > envelopeDb[plateauEnd + 1]!
      ) {
        const peak = Math.floor((index + plateauEnd) / 2);
        if (
          envelopeDb[peak]! > thresholdDb[peak]! &&
          peakProminence(envelopeDb, peak) >= minimumProminence
        ) {
          peaks.push(peak);
        }
      }
      index = plateauEnd + 1;
    } else {
      index += 1;
    }
  }
  const selected: number[] = [];
  for (const peak of peaks.sort(
    (left, right) => envelopeDb[right]! - envelopeDb[left]! || left - right,
  )) {
    if (selected.every((other) => Math.abs(other - peak) >= minimumDistance)) {
      selected.push(peak);
    }
  }
  return selected.sort((left, right) => left - right);
}

function refineCandidate(
  candidate: number,
  envelope: Float64Array,
  sampleRate: number,
  config: OnsetDetectorConfig,
): number {
  const lookback = samplesForMs(config.refinementLookbackMs, sampleRate);
  const start = Math.max(0, candidate - lookback);
  const baselineWidth = Math.max(1, Math.floor((candidate - start + 1) / 4));
  const baselineValues = Array.from(
    envelope.slice(start, start + baselineWidth),
  ).sort((left, right) => left - right);
  const middle = Math.floor(baselineValues.length / 2);
  const baseline =
    baselineValues.length % 2 === 0
      ? (baselineValues[middle - 1]! + baselineValues[middle]!) / 2
      : baselineValues[middle]!;
  const peak = envelope[candidate]!;
  const riseThreshold =
    baseline + config.refinementRiseFraction * Math.max(0, peak - baseline);
  const sustain = Math.max(
    1,
    samplesForMs(config.envelopeWindowMs / 4, sampleRate),
  );
  let run = 0;
  for (let position = start; position <= candidate; position += 1) {
    run = envelope[position]! >= riseThreshold ? run + 1 : 0;
    if (run === sustain) return position - sustain + 1;
  }
  return candidate;
}

function rmsDb(values: Float64Array, start: number, end: number): number {
  if (end <= start) return DB_FLOOR;
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += values[index]! ** 2;
  return Math.max(
    DB_FLOOR,
    Math.min(
      0,
      20 * Math.log10(Math.max(Math.sqrt(sum / (end - start)), 1e-8)),
    ),
  );
}

function median(values: number[]): number | null {
  if (values.length < 3) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export function detectOnsets(
  samples: Float32Array,
  sampleRate: number,
  config: OnsetDetectorConfig,
): OnsetDetectionResult {
  if (!(sampleRate > 0) || samples.length === 0) {
    throw new Error(
      "samples must be a non-empty mono Float32Array with a positive sample rate",
    );
  }
  if (samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error("samples must contain only finite values");
  }
  validateConfig(config, sampleRate);
  const filtered = preprocess(samples, sampleRate, config);
  const envelope = rmsEnvelope(
    filtered,
    samplesForMs(config.envelopeWindowMs, sampleRate),
  );
  const envelopeDb = amplitudeDb(envelope);
  const thresholdDb = adaptiveThreshold(
    envelopeDb,
    samplesForMs(config.noiseFloorWindowMs, sampleRate, true),
    config,
  );
  const candidates = candidateSamples(
    envelopeDb,
    thresholdDb,
    samplesForMs(config.candidateMinDistanceMs, sampleRate),
    Math.max(1, config.thresholdOffsetDb / 3),
  );
  const pairs: Array<{ candidate: number; attack: number }> = [];
  for (const candidate of candidates) {
    const attack = refineCandidate(candidate, envelope, sampleRate, config);
    const previous = pairs.at(-1);
    if (previous?.attack === attack) {
      if (envelopeDb[candidate]! > envelopeDb[previous.candidate]!) {
        pairs[pairs.length - 1] = { candidate, attack };
      }
    } else {
      pairs.push({ candidate, attack });
    }
  }

  const attackWindow = samplesForMs(config.attackWindowMs, sampleRate);
  const energyWindow = samplesForMs(config.energyWindowMs, sampleRate);
  const boundaryMargin = Math.max(
    energyWindow,
    samplesForMs(config.refinementLookbackMs, sampleRate),
  );
  const minimumDistance = samplesForMs(
    config.candidateMinDistanceMs,
    sampleRate,
  );
  const temporary: Array<{
    attack: number;
    attackDb: number;
    energyDb: number;
    confidence: number;
    flags: DetectedStrokeFlag[];
  }> = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const { candidate, attack } = pairs[index]!;
    const nextAttack = pairs[index + 1]?.attack ?? filtered.length;
    const attackEnd = Math.min(
      filtered.length,
      nextAttack,
      attack + attackWindow,
    );
    const energyEnd = Math.min(
      filtered.length,
      nextAttack,
      attack + energyWindow,
    );
    let localPeak = 0;
    for (let sample = attack; sample < energyEnd; sample += 1) {
      localPeak = Math.max(localPeak, Math.abs(samples[sample]!));
    }
    const nearClipping =
      localPeak >= 10 ** (config.nearClippingThresholdDbfs / 20);
    const nearBoundary =
      attack < boundaryMargin || attack + boundaryMargin >= filtered.length;
    const excessDb = Math.max(
      0,
      envelopeDb[candidate]! - thresholdDb[candidate]!,
    );
    const clarity =
      1 - Math.exp(-excessDb / Math.max(3, config.thresholdOffsetDb));
    const lookback = samplesForMs(config.refinementLookbackMs, sampleRate);
    const stability = 1 - Math.min(1, (candidate - attack) / lookback);
    let confidence = 0.72 * clarity + 0.28 * stability;
    if (nearClipping) confidence *= 0.82;
    if (nearBoundary) confidence *= 0.82;
    confidence = Math.max(0, Math.min(1, confidence));
    if (confidence < config.confidenceThreshold * 0.5) continue;
    const flags: DetectedStrokeFlag[] = [];
    if (nearClipping) flags.push("near-clipping");
    if (confidence < config.confidenceThreshold) flags.push("weak-signal");
    if (nearBoundary) flags.push("near-recording-boundary");
    if (
      index > 0 &&
      attack - pairs[index - 1]!.attack < Math.round(1.5 * minimumDistance)
    ) {
      flags.push("possible-double-trigger");
    }
    temporary.push({
      attack,
      attackDb: rmsDb(filtered, attack, attackEnd),
      energyDb: rmsDb(filtered, attack, energyEnd),
      confidence,
      flags,
    });
  }
  const attackMedian = median(
    temporary
      .filter(
        (stroke) =>
          stroke.confidence >= config.confidenceThreshold &&
          !stroke.flags.includes("near-clipping"),
      )
      .map((stroke) => stroke.attackDb),
  );
  const energyMedian = median(
    temporary
      .filter(
        (stroke) =>
          stroke.confidence >= config.confidenceThreshold &&
          !stroke.flags.includes("near-clipping"),
      )
      .map((stroke) => stroke.energyDb),
  );
  const strokes = temporary.map<DetectedStroke>((stroke, index) => ({
    id: `det-${index.toString().padStart(4, "0")}`,
    sampleIndex: stroke.attack,
    timeSec: stroke.attack / sampleRate,
    attackStrengthDbfs: stroke.attackDb,
    strokeEnergyDbfs: stroke.energyDb,
    relativeAttackDb:
      attackMedian === null ? null : stroke.attackDb - attackMedian,
    relativeEnergyDb:
      energyMedian === null ? null : stroke.energyDb - energyMedian,
    confidence: stroke.confidence,
    flags: stroke.flags,
  }));
  return {
    sampleRate,
    strokes,
    diagnostics: {
      candidateSamples: pairs.map((pair) => pair.candidate),
      refinedSamples: pairs.map((pair) => pair.attack),
    },
  };
}
