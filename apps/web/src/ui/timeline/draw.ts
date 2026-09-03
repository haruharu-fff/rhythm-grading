import type { TimelineScene, TimelineSelection } from "./types";

const COLORS = {
  background: "#0b1110",
  panel: "#101a17",
  line: "#2b3a35",
  lineStrong: "#52645d",
  text: "#e6f0eb",
  muted: "#91a59b",
  target: "#f5c15d",
  targetRoll: "#8ec9ff",
  actual: "#eaf7f0",
  early: "#73b8ff",
  late: "#ff9d76",
  accurate: "#7ae0a2",
  miss: "#ff6f7d",
  extra: "#db8cff",
  roll: "#285b78",
  rollStripe: "#5d9cc3",
  dynamics: "#5f4b85",
  selection: "#ffffff",
} as const;

function timingColor(errorSec: number | null): string {
  if (errorSec === null || Math.abs(errorSec) <= 0.003) return COLORS.accurate;
  return errorSec < 0 ? COLORS.early : COLORS.late;
}

function timingMark(errorSec: number | null): string {
  if (errorSec === null || Math.abs(errorSec) <= 0.003) return "•";
  return errorSec < 0 ? "E" : "L";
}

function drawGrid(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
): void {
  const { layout } = scene;
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, layout.width, layout.height);
  context.fillStyle = COLORS.panel;
  context.fillRect(
    layout.plotLeft,
    layout.regionTop - 9,
    layout.plotRight - layout.plotLeft,
    62,
  );
  context.fillRect(
    layout.plotLeft,
    layout.targetY - 27,
    layout.plotRight - layout.plotLeft,
    layout.detectedY - layout.targetY + 54,
  );
  for (const line of scene.gridLines) {
    context.beginPath();
    context.strokeStyle =
      line.kind === "beat" ? COLORS.lineStrong : COLORS.line;
    context.lineWidth = line.kind === "beat" ? 1 : 0.5;
    context.moveTo(Math.round(line.x) + 0.5, layout.regionTop - 9);
    context.lineTo(Math.round(line.x) + 0.5, layout.plotBottom);
    context.stroke();
    if (line.label !== null) {
      context.fillStyle = COLORS.muted;
      context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.textAlign = "center";
      context.fillText(line.label, line.x, 18);
    }
  }
  context.strokeStyle = COLORS.lineStrong;
  context.lineWidth = 1;
  for (const y of [layout.targetY, layout.detectedY]) {
    context.beginPath();
    context.moveTo(layout.plotLeft, y);
    context.lineTo(layout.plotRight, y);
    context.stroke();
  }
  context.fillStyle = COLORS.muted;
  context.font = "600 10px Inter, system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText("TARGET", layout.plotLeft - 10, layout.targetY + 4);
  context.fillText("ACTUAL", layout.plotLeft - 10, layout.detectedY + 4);
}

function drawRegions(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
): void {
  for (const glyph of scene.regions) {
    const width = Math.max(1, glyph.xEnd - glyph.xStart);
    if (glyph.region.type === "roll") {
      context.fillStyle = COLORS.roll;
      context.fillRect(glyph.xStart, glyph.y, width, glyph.height);
      context.save();
      context.beginPath();
      context.rect(glyph.xStart, glyph.y, width, glyph.height);
      context.clip();
      context.strokeStyle = COLORS.rollStripe;
      context.lineWidth = 1;
      const spacing = glyph.region.mode === "measured" ? 8 : 13;
      for (
        let x = glyph.xStart - glyph.height;
        x < glyph.xEnd + glyph.height;
        x += spacing
      ) {
        context.beginPath();
        context.moveTo(x, glyph.y + glyph.height);
        context.lineTo(x + glyph.height, glyph.y);
        context.stroke();
      }
      context.restore();
      context.fillStyle = COLORS.text;
      context.font = "600 10px Inter, system-ui, sans-serif";
      context.textAlign = "left";
      context.fillText(
        glyph.region.mode === "measured" ? "MEASURED ROLL" : "UNMEASURED ROLL",
        glyph.xStart + 6,
        glyph.y + 14,
      );
    } else {
      const rising = glyph.region.type === "crescendo";
      context.beginPath();
      context.moveTo(
        glyph.xStart,
        rising ? glyph.y + glyph.height - 2 : glyph.y + 2,
      );
      context.lineTo(
        glyph.xEnd,
        rising ? glyph.y + 2 : glyph.y + glyph.height - 2,
      );
      context.lineTo(glyph.xEnd, glyph.y + glyph.height);
      context.lineTo(glyph.xStart, glyph.y + glyph.height);
      context.closePath();
      context.fillStyle = COLORS.dynamics;
      context.fill();
      context.fillStyle = COLORS.text;
      context.font = "600 10px Inter, system-ui, sans-serif";
      context.textAlign = "left";
      context.fillText(
        rising ? "CRESC." : "DECRESC.",
        glyph.xStart + 6,
        glyph.y + 14,
      );
    }
  }
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
): void {
  if (scene.waveform.length === 0) return;
  const centerY = 108;
  const amplitude = 19;
  context.beginPath();
  context.strokeStyle = "#62736b";
  context.globalAlpha = 0.6;
  context.lineWidth = 1;
  for (const bucket of scene.waveform) {
    context.moveTo(bucket.x, centerY - bucket.maximum * amplitude);
    context.lineTo(bucket.x, centerY - bucket.minimum * amplitude);
  }
  context.stroke();
  context.globalAlpha = 1;
}

function drawMatches(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
): void {
  context.save();
  context.setLineDash([3, 4]);
  context.lineWidth = 1;
  for (const match of scene.matches) {
    context.beginPath();
    context.strokeStyle = timingColor(match.timingErrorSec);
    context.globalAlpha = 0.46;
    context.moveTo(match.targetX, match.targetY + 8);
    context.lineTo(match.detectedX, match.detectedY - 8);
    context.stroke();
  }
  context.restore();
  context.globalAlpha = 1;
}

function drawTargetTriangle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  context.beginPath();
  context.moveTo(x, y + size);
  context.lineTo(x - size, y - size);
  context.lineTo(x + size, y - size);
  context.closePath();
  context.fill();
}

function drawTargets(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
): void {
  context.textAlign = "center";
  for (const stroke of scene.targets) {
    context.fillStyle =
      stroke.origin === "measured-roll" ? COLORS.targetRoll : COLORS.target;
    drawTargetTriangle(context, stroke.x, stroke.y, stroke.accent ? 7 : 5);
    if (stroke.accent) {
      context.strokeStyle = COLORS.target;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(stroke.x, stroke.y, 10, 0, Math.PI * 2);
      context.stroke();
    }
    if (stroke.hand !== "unspecified" && scene.pixelsPerSecond > 90) {
      context.fillStyle = COLORS.muted;
      context.font = "600 9px Inter, system-ui, sans-serif";
      context.fillText(stroke.hand, stroke.x, stroke.y - 13);
    }
    if (stroke.missed) {
      context.strokeStyle = COLORS.miss;
      context.lineWidth = 2.4;
      context.beginPath();
      context.moveTo(stroke.x - 8, stroke.y - 8);
      context.lineTo(stroke.x + 8, stroke.y + 8);
      context.moveTo(stroke.x + 8, stroke.y - 8);
      context.lineTo(stroke.x - 8, stroke.y + 8);
      context.stroke();
      context.fillStyle = COLORS.miss;
      context.font = "700 9px Inter, system-ui, sans-serif";
      context.fillText("MISS", stroke.x, stroke.y + 23);
    }
  }
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  context.beginPath();
  context.moveTo(x, y - size);
  context.lineTo(x + size, y);
  context.lineTo(x, y + size);
  context.lineTo(x - size, y);
  context.closePath();
  context.fill();
}

function drawDetected(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
): void {
  context.textAlign = "center";
  for (const stroke of scene.detected) {
    if (stroke.status === "extra") {
      context.fillStyle = COLORS.extra;
      drawDiamond(context, stroke.x, stroke.y, 8);
      context.font = "700 9px Inter, system-ui, sans-serif";
      context.fillText("EXTRA", stroke.x, stroke.y + 23);
      continue;
    }
    context.fillStyle =
      stroke.status === "roll"
        ? COLORS.targetRoll
        : timingColor(stroke.timingErrorSec);
    if (stroke.status === "roll") {
      context.fillRect(stroke.x - 5, stroke.y - 5, 10, 10);
    } else {
      context.beginPath();
      context.arc(stroke.x, stroke.y, 6, 0, Math.PI * 2);
      context.fill();
    }
    if (stroke.status === "matched") {
      context.fillStyle = timingColor(stroke.timingErrorSec);
      context.font = "700 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      context.fillText(
        timingMark(stroke.timingErrorSec),
        stroke.x,
        stroke.y - 13,
      );
      if (scene.pixelsPerSecond > 180 && stroke.timingErrorSec !== null) {
        const milliseconds = Math.round(stroke.timingErrorSec * 1000);
        context.fillText(
          `${milliseconds > 0 ? "+" : ""}${milliseconds}`,
          stroke.x,
          stroke.y + 20,
        );
      }
    }
    if (stroke.confidence < 0.5) {
      context.strokeStyle = COLORS.extra;
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(stroke.x, stroke.y, 10, 0, Math.PI * 2);
      context.stroke();
    }
  }
}

function drawSelection(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
  selection: TimelineSelection | null,
): void {
  if (selection === null) return;
  const target = scene.hitTargets.find(
    (candidate) =>
      candidate.selection.kind === selection.kind &&
      candidate.selection.id === selection.id,
  );
  if (target === undefined) return;
  context.save();
  context.strokeStyle = COLORS.selection;
  context.lineWidth = 2;
  context.setLineDash([4, 3]);
  context.strokeRect(
    target.x - 4,
    target.y - 4,
    target.width + 8,
    target.height + 8,
  );
  context.restore();
}

export function drawTimeline(
  context: CanvasRenderingContext2D,
  scene: TimelineScene,
  selection: TimelineSelection | null,
): void {
  drawGrid(context, scene);
  context.save();
  context.beginPath();
  context.rect(
    scene.layout.plotLeft,
    scene.layout.regionTop - 10,
    scene.layout.plotRight - scene.layout.plotLeft,
    scene.layout.plotBottom - scene.layout.regionTop + 10,
  );
  context.clip();
  drawRegions(context, scene);
  drawWaveform(context, scene);
  drawMatches(context, scene);
  drawTargets(context, scene);
  drawDetected(context, scene);
  drawSelection(context, scene, selection);
  context.restore();
}
