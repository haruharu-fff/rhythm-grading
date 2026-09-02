import type { MatcherConfig, ScoreDocument } from "../src/domain";

export const matcherConfig: MatcherConfig = {
  timingSigmaMs: 25,
  maxMatchDistanceMs: 120,
  missPenalty: 4,
  extraPenalty: 4,
  confidencePenaltyWeight: 0.5,
  useAmplitudeInMatching: false,
  offsetSearchRangeMs: 5_000,
  offsetCandidateWindowSize: 8,
  unmeasuredRollBoundaryMarginMs: 20,
  affineRefinementEnabled: true,
  minTimeScale: 0.8,
  maxTimeScale: 1.2,
};

export function makeScore(
  overrides: Partial<ScoreDocument> = {},
): ScoreDocument {
  const timestamp = "2026-09-02T00:00:00.000Z";
  return {
    schemaVersion: "1.0",
    id: "test-score",
    title: "Test score",
    createdAt: timestamp,
    updatedAt: timestamp,
    lengthBeats: { numerator: 8, denominator: 1 },
    initialTempoBpm: 120,
    tempoChanges: [],
    timeSignatures: [
      { beat: { numerator: 0, denominator: 1 }, numerator: 4, denominator: 4 },
    ],
    strokes: Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      beat: { numerator: index, denominator: 1 },
      hand: index % 2 === 0 ? ("R" as const) : ("L" as const),
      accent: index % 4 === 0,
    })),
    regions: [],
    ...overrides,
  };
}
