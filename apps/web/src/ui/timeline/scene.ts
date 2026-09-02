import type { CompiledTempoSegment, TargetRegion } from "../../domain";
import { fractionToNumber } from "../../score";
import type {
  DetectedGlyph,
  DetectedGlyphStatus,
  GridLineGlyph,
  HitTarget,
  MatchGlyph,
  RegionGlyph,
  TargetGlyph,
  TimelineData,
  TimelineDisplayMode,
  TimelineScene,
  TimelineSelection,
  TimelineViewport,
} from "./types";
import { timeToX, timelineLayout } from "./viewport";

function lowerBound<T>(
  values: T[],
  target: number,
  select: (value: T) => number,
): number {
  let left = 0;
  let right = values.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (select(values[middle]!) < target) left = middle + 1;
    else right = middle;
  }
  return left;
}

function visibleSlice<T>(
  values: T[],
  start: number,
  end: number,
  select: (value: T) => number,
): T[] {
  const first = Math.max(0, lowerBound(values, start, select) - 1);
  const last = Math.min(values.length, lowerBound(values, end, select) + 1);
  return values.slice(first, last).filter((value) => {
    const selected = select(value);
    return selected >= start && selected <= end;
  });
}

function beatToSeconds(beat: number, tempoMap: CompiledTempoSegment[]): number {
  const segment = tempoMap.find(
    (candidate) =>
      beat >= fractionToNumber(candidate.startBeat) &&
      beat <= fractionToNumber(candidate.endBeat),
  );
  if (segment === undefined) return 0;
  return (
    segment.startTimeSec +
    ((beat - fractionToNumber(segment.startBeat)) * 60) / segment.bpm
  );
}

function gridLines(
  data: TimelineData,
  viewport: TimelineViewport,
  layout: ReturnType<typeof timelineLayout>,
): GridLineGlyph[] {
  const pixelsPerSecond =
    (layout.plotRight - layout.plotLeft) /
    (viewport.endSec - viewport.startSec);
  const result: GridLineGlyph[] = [];
  for (const segment of data.target.tempoMap) {
    const startBeat = fractionToNumber(segment.startBeat);
    const endBeat = fractionToNumber(segment.endBeat);
    const pixelsPerBeat = pixelsPerSecond * (60 / segment.bpm);
    const step =
      pixelsPerBeat >= 120
        ? 0.25
        : pixelsPerBeat >= 56
          ? 0.5
          : pixelsPerBeat >= 18
            ? 1
            : 4;
    let beat = Math.ceil((startBeat - 1e-9) / step) * step;
    for (; beat <= endBeat + 1e-9; beat += step) {
      const timeSec = beatToSeconds(beat, data.target.tempoMap);
      if (timeSec < viewport.startSec || timeSec > viewport.endSec) continue;
      const isBeat = Math.abs(beat - Math.round(beat)) < 1e-7;
      result.push({
        x: timeToX(timeSec, viewport, layout),
        timeSec,
        beat,
        kind: isBeat ? "beat" : "subdivision",
        label: isBeat ? `${Math.round(beat)}` : null,
      });
      if (result.length >= 10_000) return result;
    }
  }
  const unique = new Map<string, GridLineGlyph>();
  for (const line of result) unique.set(line.timeSec.toFixed(9), line);
  return [...unique.values()].sort(
    (left, right) => left.timeSec - right.timeSec,
  );
}

function regionGlyphs(
  regions: TargetRegion[],
  viewport: TimelineViewport,
  layout: ReturnType<typeof timelineLayout>,
): RegionGlyph[] {
  return regions
    .filter(
      (region) =>
        region.endTimeSec >= viewport.startSec &&
        region.startTimeSec <= viewport.endSec,
    )
    .map((region) => ({
      id: region.id,
      region,
      xStart: timeToX(
        Math.max(region.startTimeSec, viewport.startSec),
        viewport,
        layout,
      ),
      xEnd: timeToX(
        Math.min(region.endTimeSec, viewport.endSec),
        viewport,
        layout,
      ),
      y: region.type === "roll" ? layout.regionTop : layout.regionTop + 25,
      height: region.type === "roll" ? 20 : 19,
    }));
}

function selectionHitTarget(
  selection: TimelineSelection,
  x: number,
  y: number,
  width: number,
  height: number,
  priority: number,
): HitTarget {
  return { selection, x, y, width, height, priority };
}

export function buildTimelineScene(
  data: TimelineData,
  viewport: TimelineViewport,
  width: number,
  height: number,
  mode: TimelineDisplayMode,
): TimelineScene {
  const layout = timelineLayout(width, height);
  const pixelsPerSecond =
    (layout.plotRight - layout.plotLeft) /
    (viewport.endSec - viewport.startSec);
  const misses = new Set(
    data.alignment.misses.map((miss) => miss.targetStrokeId),
  );
  const matchByDetected = new Map(
    data.alignment.matches.map((match) => [match.detectedStrokeId, match]),
  );
  const extras = new Set(
    data.alignment.extras.map((extra) => extra.detectedStrokeId),
  );
  const rollAssigned = new Set(
    data.alignment.rollAssignments.flatMap(
      (assignment) => assignment.detectedStrokeIds,
    ),
  );
  const adjustedTime = (timeSec: number): number =>
    timeSec - data.alignment.estimatedOffsetSec;
  const overscanSec = 18 / pixelsPerSecond;

  const targets: TargetGlyph[] =
    mode === "actual"
      ? []
      : visibleSlice(
          data.target.strokes,
          viewport.startSec - overscanSec,
          viewport.endSec + overscanSec,
          (stroke) => stroke.timeSec,
        ).map((stroke) => ({
          id: stroke.id,
          x: timeToX(stroke.timeSec, viewport, layout),
          y: layout.targetY,
          accent: stroke.accent,
          hand: stroke.hand,
          missed: misses.has(stroke.id),
          origin: stroke.origin,
        }));

  const visibleDetected =
    mode === "target"
      ? []
      : visibleSlice(
          data.detected,
          viewport.startSec + data.alignment.estimatedOffsetSec - overscanSec,
          viewport.endSec + data.alignment.estimatedOffsetSec + overscanSec,
          (stroke) => stroke.timeSec,
        );
  const detected: DetectedGlyph[] = visibleDetected.map((stroke) => {
    const match = matchByDetected.get(stroke.id);
    const status: DetectedGlyphStatus = extras.has(stroke.id)
      ? "extra"
      : rollAssigned.has(stroke.id)
        ? "roll"
        : "matched";
    return {
      id: stroke.id,
      x: timeToX(adjustedTime(stroke.timeSec), viewport, layout),
      y: layout.detectedY,
      status,
      timingErrorSec:
        match === undefined
          ? null
          : adjustedTime(match.detectedTimeSec) - match.targetTimeSec,
      confidence: stroke.confidence,
    };
  });

  const matches: MatchGlyph[] =
    mode !== "overlay"
      ? []
      : data.alignment.matches
          .filter((match) => {
            const actual = adjustedTime(match.detectedTimeSec);
            return (
              Math.max(match.targetTimeSec, actual) >= viewport.startSec &&
              Math.min(match.targetTimeSec, actual) <= viewport.endSec
            );
          })
          .map((match) => ({
            targetStrokeId: match.targetStrokeId,
            detectedStrokeId: match.detectedStrokeId,
            targetX: timeToX(match.targetTimeSec, viewport, layout),
            detectedX: timeToX(
              adjustedTime(match.detectedTimeSec),
              viewport,
              layout,
            ),
            targetY: layout.targetY,
            detectedY: layout.detectedY,
            timingErrorSec:
              adjustedTime(match.detectedTimeSec) - match.targetTimeSec,
          }));

  const regions = regionGlyphs(data.target.regions, viewport, layout);
  const hitTargets: HitTarget[] = [
    ...regions.map((region) =>
      selectionHitTarget(
        { kind: "region", id: region.id },
        region.xStart,
        region.y,
        Math.max(8, region.xEnd - region.xStart),
        region.height,
        1,
      ),
    ),
    ...targets.map((stroke) =>
      selectionHitTarget(
        { kind: "target", id: stroke.id },
        stroke.x - 10,
        stroke.y - 14,
        20,
        28,
        3,
      ),
    ),
    ...detected.map((stroke) =>
      selectionHitTarget(
        { kind: "detected", id: stroke.id },
        stroke.x - 11,
        stroke.y - 12,
        22,
        24,
        4,
      ),
    ),
  ];
  return {
    layout,
    pixelsPerSecond,
    gridLines: gridLines(data, viewport, layout),
    regions,
    targets,
    detected,
    matches,
    hitTargets,
  };
}

export function hitTest(
  hitTargets: HitTarget[],
  x: number,
  y: number,
): TimelineSelection | null {
  const candidates = hitTargets.filter(
    (target) =>
      x >= target.x &&
      x <= target.x + target.width &&
      y >= target.y &&
      y <= target.y + target.height,
  );
  candidates.sort((left, right) => right.priority - left.priority);
  return candidates[0]?.selection ?? null;
}
