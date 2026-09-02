import type {
  TimelineBounds,
  TimelineData,
  TimelineLayout,
  TimelineViewport,
} from "./types";

const MIN_VIEW_DURATION_SEC = 0.08;

export function timelineBounds(data: TimelineData): TimelineBounds {
  const adjustedDetected = data.detected.map(
    (stroke) => stroke.timeSec - data.alignment.estimatedOffsetSec,
  );
  const minimum = Math.min(0, ...adjustedDetected);
  const maximum = Math.max(data.target.durationSec, ...adjustedDetected, 0.25);
  const duration = Math.max(0.25, maximum - minimum);
  const padding = Math.max(0.05, duration * 0.025);
  return { startSec: minimum - padding, endSec: maximum + padding };
}

export function fitViewport(bounds: TimelineBounds): TimelineViewport {
  return { ...bounds };
}

export function clampViewport(
  viewport: TimelineViewport,
  bounds: TimelineBounds,
): TimelineViewport {
  const totalDuration = bounds.endSec - bounds.startSec;
  const duration = Math.min(
    totalDuration,
    Math.max(MIN_VIEW_DURATION_SEC, viewport.endSec - viewport.startSec),
  );
  let startSec = viewport.startSec;
  if (startSec < bounds.startSec) startSec = bounds.startSec;
  if (startSec + duration > bounds.endSec) startSec = bounds.endSec - duration;
  return { startSec, endSec: startSec + duration };
}

export function zoomViewport(
  viewport: TimelineViewport,
  anchorSec: number,
  zoomFactor: number,
  bounds: TimelineBounds,
): TimelineViewport {
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) return viewport;
  const oldDuration = viewport.endSec - viewport.startSec;
  const newDuration = oldDuration / zoomFactor;
  const anchorRatio = (anchorSec - viewport.startSec) / oldDuration;
  return clampViewport(
    {
      startSec: anchorSec - newDuration * anchorRatio,
      endSec: anchorSec + newDuration * (1 - anchorRatio),
    },
    bounds,
  );
}

export function panViewport(
  viewport: TimelineViewport,
  deltaSec: number,
  bounds: TimelineBounds,
): TimelineViewport {
  return clampViewport(
    {
      startSec: viewport.startSec + deltaSec,
      endSec: viewport.endSec + deltaSec,
    },
    bounds,
  );
}

export function centerViewport(
  viewport: TimelineViewport,
  timeSec: number,
  bounds: TimelineBounds,
): TimelineViewport {
  const halfDuration = (viewport.endSec - viewport.startSec) / 2;
  return clampViewport(
    { startSec: timeSec - halfDuration, endSec: timeSec + halfDuration },
    bounds,
  );
}

export function timelineLayout(width: number, height: number): TimelineLayout {
  const safeHeight = Math.max(260, height);
  return {
    width,
    height: safeHeight,
    plotLeft: 62,
    plotRight: Math.max(63, width - 20),
    regionTop: 38,
    regionHeight: 48,
    targetY: 142,
    detectedY: 218,
    plotBottom: safeHeight - 28,
  };
}

export function timeToX(
  timeSec: number,
  viewport: TimelineViewport,
  layout: TimelineLayout,
): number {
  const ratio =
    (timeSec - viewport.startSec) / (viewport.endSec - viewport.startSec);
  return layout.plotLeft + ratio * (layout.plotRight - layout.plotLeft);
}

export function xToTime(
  x: number,
  viewport: TimelineViewport,
  layout: TimelineLayout,
): number {
  const ratio = (x - layout.plotLeft) / (layout.plotRight - layout.plotLeft);
  return viewport.startSec + ratio * (viewport.endSec - viewport.startSec);
}
