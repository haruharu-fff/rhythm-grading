import type {
  DetectedStroke,
  DetectedStrokeFlag,
  TargetPerformance,
} from "../domain";

export interface SyntheticInjectedStroke {
  id: string;
  timeSec: number;
  attackStrengthDbfs?: number;
  strokeEnergyDbfs?: number;
  confidence?: number;
  flags?: DetectedStrokeFlag[];
}

export interface SyntheticPerformanceConfig {
  sampleRate?: number;
  offsetSec?: number;
  timeScale?: number;
  localErrorSecByTargetId?: Record<string, number>;
  missTargetIds?: string[];
  relativeDbByTargetId?: Record<string, number>;
  confidenceByTargetId?: Record<string, number>;
  flagsByTargetId?: Record<string, DetectedStrokeFlag[]>;
  injectedStrokes?: SyntheticInjectedStroke[];
  minimumReferenceStrokes?: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function generateSyntheticDetectedStrokes(
  target: TargetPerformance,
  config: SyntheticPerformanceConfig = {},
): DetectedStroke[] {
  const sampleRate = config.sampleRate ?? 48_000;
  const offsetSec = config.offsetSec ?? 0;
  const timeScale = config.timeScale ?? 1;
  const misses = new Set(config.missTargetIds ?? []);
  const strokes: DetectedStroke[] = [];

  for (const targetStroke of target.strokes) {
    if (misses.has(targetStroke.id)) continue;
    const localError = config.localErrorSecByTargetId?.[targetStroke.id] ?? 0;
    const desiredTimeSec =
      offsetSec + timeScale * targetStroke.timeSec + localError;
    const sampleIndex = Math.round(desiredTimeSec * sampleRate);
    const relativeDb =
      config.relativeDbByTargetId?.[targetStroke.id] ??
      (targetStroke.accent ? 6 : 0);
    const attackStrengthDbfs = Math.min(0, -18 + relativeDb);
    strokes.push({
      id: `det:${targetStroke.id}`,
      sampleIndex,
      timeSec: sampleIndex / sampleRate,
      attackStrengthDbfs,
      strokeEnergyDbfs: Math.min(0, attackStrengthDbfs + 2),
      relativeAttackDb: null,
      relativeEnergyDb: null,
      confidence: clamp(
        config.confidenceByTargetId?.[targetStroke.id] ?? 0.98,
        0,
        1,
      ),
      flags: [...(config.flagsByTargetId?.[targetStroke.id] ?? [])],
    });
  }

  for (const injected of config.injectedStrokes ?? []) {
    const sampleIndex = Math.round(injected.timeSec * sampleRate);
    const attackStrengthDbfs = Math.min(0, injected.attackStrengthDbfs ?? -18);
    strokes.push({
      id: injected.id,
      sampleIndex,
      timeSec: sampleIndex / sampleRate,
      attackStrengthDbfs,
      strokeEnergyDbfs: Math.min(
        0,
        injected.strokeEnergyDbfs ?? attackStrengthDbfs + 2,
      ),
      relativeAttackDb: null,
      relativeEnergyDb: null,
      confidence: clamp(injected.confidence ?? 0.98, 0, 1),
      flags: [...(injected.flags ?? [])],
    });
  }
  strokes.sort(
    (left, right) =>
      left.sampleIndex - right.sampleIndex || left.id.localeCompare(right.id),
  );

  const reference = strokes.filter(
    (stroke) =>
      stroke.confidence >= 0.5 &&
      !stroke.flags.includes("near-clipping") &&
      !stroke.flags.includes("weak-signal"),
  );
  if (reference.length >= (config.minimumReferenceStrokes ?? 2)) {
    const attackMedian = median(
      reference.map((stroke) => stroke.attackStrengthDbfs),
    );
    const energyMedian = median(
      reference.map((stroke) => stroke.strokeEnergyDbfs),
    );
    for (const stroke of strokes) {
      stroke.relativeAttackDb = stroke.attackStrengthDbfs - attackMedian;
      stroke.relativeEnergyDb = stroke.strokeEnergyDbfs - energyMedian;
    }
  }
  return strokes;
}
