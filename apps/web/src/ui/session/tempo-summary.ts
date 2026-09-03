import type { CompiledTempoSegment } from "../../domain";

export interface TempoSummary {
  bpm: string;
  changes: string;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatBeat(segment: CompiledTempoSegment): string {
  const { numerator, denominator } = segment.startBeat;
  return denominator === 1
    ? numerator.toString()
    : `${numerator}/${denominator}`;
}

export function summarizeTempoMap(
  segments: readonly CompiledTempoSegment[],
): TempoSummary {
  if (segments.length === 0) return { bpm: "—", changes: "テンポ情報なし" };

  const bpm = segments.map((segment) => formatNumber(segment.bpm)).join(" → ");
  if (segments.length === 1) {
    return { bpm: `${bpm} BPM`, changes: "全区間一定" };
  }

  return {
    bpm: `${bpm} BPM`,
    changes: segments
      .slice(1)
      .map(
        (segment) =>
          `${formatBeat(segment)}拍から${formatNumber(segment.bpm)} BPM`,
      )
      .join("、"),
  };
}
