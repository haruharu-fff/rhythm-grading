import type {
  DetectedStroke,
  StrokeAlignment,
  TargetPerformance,
  TargetRegion,
} from "../../domain";

export type TimelineDisplayMode = "overlay" | "target" | "actual";

export type TimelineSelection =
  | { kind: "target"; id: string }
  | { kind: "detected"; id: string }
  | { kind: "region"; id: string };

export interface TimelineData {
  target: TargetPerformance;
  detected: DetectedStroke[];
  alignment: StrokeAlignment;
}

export interface TimelineBounds {
  startSec: number;
  endSec: number;
}

export interface TimelineViewport {
  startSec: number;
  endSec: number;
}

export interface TimelineLayout {
  width: number;
  height: number;
  plotLeft: number;
  plotRight: number;
  regionTop: number;
  regionHeight: number;
  targetY: number;
  detectedY: number;
  plotBottom: number;
}

export interface GridLineGlyph {
  x: number;
  timeSec: number;
  beat: number;
  kind: "beat" | "subdivision";
  label: string | null;
}

export interface RegionGlyph {
  id: string;
  region: TargetRegion;
  xStart: number;
  xEnd: number;
  y: number;
  height: number;
}

export interface TargetGlyph {
  id: string;
  x: number;
  y: number;
  accent: boolean;
  hand: "R" | "L" | "unspecified";
  missed: boolean;
  origin: "stroke" | "measured-roll";
}

export type DetectedGlyphStatus = "matched" | "extra" | "roll";

export interface DetectedGlyph {
  id: string;
  x: number;
  y: number;
  status: DetectedGlyphStatus;
  timingErrorSec: number | null;
  confidence: number;
}

export interface MatchGlyph {
  targetStrokeId: string;
  detectedStrokeId: string;
  targetX: number;
  detectedX: number;
  targetY: number;
  detectedY: number;
  timingErrorSec: number;
}

export interface HitTarget {
  selection: TimelineSelection;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
}

export interface TimelineScene {
  layout: TimelineLayout;
  pixelsPerSecond: number;
  gridLines: GridLineGlyph[];
  regions: RegionGlyph[];
  targets: TargetGlyph[];
  detected: DetectedGlyph[];
  matches: MatchGlyph[];
  hitTargets: HitTarget[];
}
