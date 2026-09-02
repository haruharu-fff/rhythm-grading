import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { drawTimeline } from "./draw";
import { buildTimelineScene, hitTest } from "./scene";
import type {
  TimelineData,
  TimelineDisplayMode,
  TimelineSelection,
  TimelineViewport,
} from "./types";
import {
  centerViewport,
  fitViewport,
  panViewport,
  timelineBounds,
  xToTime,
  zoomViewport,
} from "./viewport";

interface TimelineCanvasProps {
  data: TimelineData;
  selection: TimelineSelection | null;
  onSelectionChange: (selection: TimelineSelection | null) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  viewport: TimelineViewport;
  moved: boolean;
}

function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "−" : "";
  const absolute = Math.abs(seconds);
  const minutes = Math.floor(absolute / 60);
  const remainder = absolute - minutes * 60;
  return `${sign}${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

export function TimelineCanvas({
  data,
  selection,
  onSelectionChange,
}: TimelineCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const bounds = useMemo(() => timelineBounds(data), [data]);
  const [viewport, setViewport] = useState<TimelineViewport>(() =>
    fitViewport(bounds),
  );
  const [mode, setMode] = useState<TimelineDisplayMode>("overlay");
  const [size, setSize] = useState({ width: 900, height: 286 });

  useEffect(() => {
    setViewport(fitViewport(bounds));
    onSelectionChange(null);
  }, [bounds, onSelectionChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const updateSize = (): void => {
      setSize({ width: Math.max(320, container.clientWidth), height: 286 });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scene = useMemo(
    () => buildTimelineScene(data, viewport, size.width, size.height, mode),
    [data, mode, size.height, size.width, viewport],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const frame = window.requestAnimationFrame(() =>
      drawTimeline(context, scene, selection),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [scene, selection, size.height, size.width]);

  const zoom = (
    factor: number,
    anchorSec = (viewport.startSec + viewport.endSec) / 2,
  ): void => {
    setViewport((current) => zoomViewport(current, anchorSec, factor, bounds));
  };

  const pan = (ratio: number): void => {
    setViewport((current) =>
      panViewport(current, (current.endSec - current.startSec) * ratio, bounds),
    );
  };

  const canvasCoordinates = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (canvas === null) return null;
    const rectangle = canvas.getBoundingClientRect();
    return { x: clientX - rectangle.left, y: clientY - rectangle.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    const point = canvasCoordinates(event.clientX, event.clientY);
    if (point === null) return;
    const selected = hitTest(scene.hitTargets, point.x, point.y);
    if (selected !== null) {
      onSelectionChange(selected);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: point.x,
      viewport,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current;
    const point = canvasCoordinates(event.clientX, event.clientY);
    if (drag === null || point === null || drag.pointerId !== event.pointerId)
      return;
    const deltaX = point.x - drag.startX;
    if (Math.abs(deltaX) > 2) drag.moved = true;
    const plotWidth = scene.layout.plotRight - scene.layout.plotLeft;
    const duration = drag.viewport.endSec - drag.viewport.startSec;
    setViewport(
      panViewport(drag.viewport, (-deltaX / plotWidth) * duration, bounds),
    );
  };

  const endPointer = (event: PointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) onSelectionChange(null);
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const point = canvasCoordinates(event.clientX, event.clientY);
      const anchor =
        point === null
          ? (viewport.startSec + viewport.endSec) / 2
          : xToTime(point.x, viewport, scene.layout);
      zoom(Math.exp(-event.deltaY * 0.003), anchor);
      return;
    }
    const plotWidth = scene.layout.plotRight - scene.layout.plotLeft;
    const secondsPerPixel = (viewport.endSec - viewport.startSec) / plotWidth;
    setViewport((current) =>
      panViewport(
        current,
        (event.deltaX + event.deltaY) * secondsPerPixel,
        bounds,
      ),
    );
  };

  const issues = useMemo(
    () =>
      [
        ...data.alignment.misses.map((miss) => ({
          selection: { kind: "target" as const, id: miss.targetStrokeId },
          timeSec: miss.targetTimeSec,
        })),
        ...data.alignment.extras.map((extra) => ({
          selection: { kind: "detected" as const, id: extra.detectedStrokeId },
          timeSec: extra.detectedTimeSec - data.alignment.estimatedOffsetSec,
        })),
      ].sort((left, right) => left.timeSec - right.timeSec),
    [data],
  );

  const jumpIssue = (direction: -1 | 1): void => {
    if (issues.length === 0) return;
    const currentIndex = issues.findIndex(
      (issue) =>
        issue.selection.kind === selection?.kind &&
        issue.selection.id === selection.id,
    );
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : issues.length - 1
        : (currentIndex + direction + issues.length) % issues.length;
    const issue = issues[nextIndex]!;
    setMode("overlay");
    onSelectionChange(issue.selection);
    setViewport((current) => centerViewport(current, issue.timeSec, bounds));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    if (event.key === "+" || event.key === "=") zoom(1.5);
    else if (event.key === "-") zoom(1 / 1.5);
    else if (event.key === "ArrowLeft") pan(-0.15);
    else if (event.key === "ArrowRight") pan(0.15);
    else if (event.key === "Home") setViewport(fitViewport(bounds));
    else return;
    event.preventDefault();
  };

  const zoomPercent = Math.round(
    ((bounds.endSec - bounds.startSec) /
      (viewport.endSec - viewport.startSec)) *
      100,
  );

  return (
    <section className="timeline-shell" aria-labelledby="timeline-title">
      <header className="timeline-header">
        <div>
          <p className="section-kicker">Performance map</p>
          <h2 id="timeline-title">Timeline</h2>
        </div>
        <div className="timeline-range" aria-live="polite">
          {formatTime(viewport.startSec)} — {formatTime(viewport.endSec)}
          <span>{zoomPercent}%</span>
        </div>
      </header>

      <div className="timeline-toolbar" aria-label="Timeline controls">
        <div className="segmented-control" aria-label="Visible events">
          {(["overlay", "target", "actual"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={mode === value ? "is-active" : ""}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "overlay"
                ? "Overlay"
                : value === "target"
                  ? "Target"
                  : "Actual"}
            </button>
          ))}
        </div>
        <div className="toolbar-cluster">
          <button
            type="button"
            onClick={() => pan(-0.2)}
            aria-label="Scroll left"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => pan(0.2)}
            aria-label="Scroll right"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => zoom(1 / 1.5)}
            aria-label="Zoom out"
          >
            −
          </button>
          <button type="button" onClick={() => zoom(1.5)} aria-label="Zoom in">
            +
          </button>
          <button
            type="button"
            onClick={() => setViewport(fitViewport(bounds))}
          >
            Fit all
          </button>
        </div>
        <div className="toolbar-cluster">
          <button
            type="button"
            onClick={() => jumpIssue(-1)}
            disabled={issues.length === 0}
          >
            Prev issue
          </button>
          <button
            type="button"
            onClick={() => jumpIssue(1)}
            disabled={issues.length === 0}
          >
            Next issue
          </button>
        </div>
      </div>

      <div className="timeline-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="timeline-canvas"
          aria-label="Rhythm performance timeline. Drag or use arrow keys to scroll; hold Control while using the wheel to zoom."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onWheel={onWheel}
        />
      </div>

      <footer className="timeline-footer">
        <div className="timeline-legend" aria-label="Timeline legend">
          <span>
            <i className="legend-shape legend-target" />
            Target
          </span>
          <span>
            <i className="legend-shape legend-actual" />
            Actual
          </span>
          <span>
            <i className="legend-shape legend-early" />E early
          </span>
          <span>
            <i className="legend-shape legend-late" />L late
          </span>
          <span>
            <i className="legend-shape legend-miss" />× miss
          </span>
          <span>
            <i className="legend-shape legend-extra" />◇ extra
          </span>
        </div>
        <p>
          Drag to scroll · Ctrl/⌘ + wheel to zoom · click a mark for details
        </p>
      </footer>
    </section>
  );
}
