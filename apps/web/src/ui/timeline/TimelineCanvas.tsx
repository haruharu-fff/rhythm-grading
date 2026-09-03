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
  const [showWaveform, setShowWaveform] = useState(true);
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
    () =>
      buildTimelineScene(
        data,
        viewport,
        size.width,
        size.height,
        mode,
        showWaveform,
      ),
    [data, mode, showWaveform, size.height, size.width, viewport],
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
          <p className="section-kicker">演奏マップ</p>
          <h2 id="timeline-title">タイムライン</h2>
        </div>
        <div className="timeline-range" aria-live="polite">
          {formatTime(viewport.startSec)} — {formatTime(viewport.endSec)}
          <span>{zoomPercent}%</span>
        </div>
      </header>

      <div className="timeline-toolbar" aria-label="タイムライン操作">
        <div className="segmented-control" aria-label="表示する打点">
          {(["overlay", "target", "actual"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={mode === value ? "is-active" : ""}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === "overlay"
                ? "重ねて表示"
                : value === "target"
                  ? "目標"
                  : "実際"}
            </button>
          ))}
        </div>
        <div className="toolbar-cluster">
          <button
            type="button"
            className={showWaveform ? "is-active" : ""}
            aria-pressed={showWaveform}
            disabled={data.waveform === undefined}
            onClick={() => setShowWaveform((current) => !current)}
          >
            波形
          </button>
          <button
            type="button"
            onClick={() => pan(-0.2)}
            aria-label="左へスクロール"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => pan(0.2)}
            aria-label="右へスクロール"
          >
            →
          </button>
          <button type="button" onClick={() => zoom(1 / 1.5)} aria-label="縮小">
            −
          </button>
          <button type="button" onClick={() => zoom(1.5)} aria-label="拡大">
            +
          </button>
          <button
            type="button"
            onClick={() => setViewport(fitViewport(bounds))}
          >
            全体表示
          </button>
        </div>
        <div className="toolbar-cluster">
          <button
            type="button"
            onClick={() => jumpIssue(-1)}
            disabled={issues.length === 0}
          >
            前の問題
          </button>
          <button
            type="button"
            onClick={() => jumpIssue(1)}
            disabled={issues.length === 0}
          >
            次の問題
          </button>
        </div>
      </div>

      <div className="timeline-canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="timeline-canvas"
          aria-label="リズム演奏のタイムライン。ドラッグまたは左右キーでスクロールし、Controlキーを押しながらホイール操作すると拡大・縮小できます。"
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
        <div className="timeline-legend" aria-label="タイムラインの凡例">
          <span>
            <i className="legend-shape legend-target" />
            目標
          </span>
          <span>
            <i className="legend-shape legend-actual" />
            実際
          </span>
          <span>
            <i className="legend-shape legend-early" />E 早い
          </span>
          <span>
            <i className="legend-shape legend-late" />L 遅い
          </span>
          <span>
            <i className="legend-shape legend-miss" />× ミス
          </span>
          <span>
            <i className="legend-shape legend-extra" />◇ 余分
          </span>
        </div>
        <p>
          ドラッグでスクロール · Ctrl/⌘ + ホイールで拡大・縮小 ·
          印をクリックして詳細表示
        </p>
      </footer>
    </section>
  );
}
