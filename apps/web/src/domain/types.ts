export interface Fraction {
  numerator: number;
  denominator: number;
}

export type Hand = "R" | "L" | "unspecified";

export interface ScoreDocument {
  schemaVersion: "1.0";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lengthBeats: Fraction;
  initialTempoBpm: number;
  tempoChanges: TempoChange[];
  timeSignatures: TimeSignatureChange[];
  strokes: ScoreStroke[];
  regions: ScoreRegion[];
  editor?: EditorMetadata;
}

export interface TempoChange {
  beat: Fraction;
  bpm: number;
}

export interface TimeSignatureChange {
  beat: Fraction;
  numerator: number;
  denominator: 1 | 2 | 4 | 8 | 16;
}

export interface ScoreStroke {
  id: string;
  beat: Fraction;
  hand: Hand;
  accent: boolean;
  targetDynamic?: number;
  tags?: string[];
}

export interface BaseRegion {
  id: string;
  startBeat: Fraction;
  endBeat: Fraction;
}

export interface RollRegion extends BaseRegion {
  type: "roll";
  mode: "measured" | "unmeasured";
  subdivision?: Fraction;
  targetDensityHz?: number;
}

export interface DynamicRegion extends BaseRegion {
  type: "crescendo" | "decrescendo";
  curve: "linear" | "ease-in" | "ease-out";
  startLevel?: number;
  endLevel?: number;
}

export type ScoreRegion = RollRegion | DynamicRegion;

export interface EditorMetadata {
  gridDivision?: number;
  snapEnabled?: boolean;
  viewportStartBeat?: Fraction;
  viewportEndBeat?: Fraction;
}

export interface CompiledTempoSegment {
  startBeat: Fraction;
  endBeat: Fraction;
  startTimeSec: number;
  endTimeSec: number;
  bpm: number;
}

export interface TargetPerformance {
  scoreId: string;
  durationSec: number;
  strokes: TargetStroke[];
  regions: TargetRegion[];
  tempoMap: CompiledTempoSegment[];
}

export interface TargetStroke {
  id: string;
  sourceStrokeId?: string;
  sourceRegionId?: string;
  beat: Fraction;
  timeSec: number;
  hand: Hand;
  accent: boolean;
  targetDynamic?: number;
  origin: "stroke" | "measured-roll";
}

export interface TargetRollRegion {
  id: string;
  sourceRegionId: string;
  type: "roll";
  mode: "measured" | "unmeasured";
  startBeat: Fraction;
  endBeat: Fraction;
  startTimeSec: number;
  endTimeSec: number;
  subdivision?: Fraction;
  targetDensityHz?: number;
}

export interface TargetDynamicRegion {
  id: string;
  sourceRegionId: string;
  type: "crescendo" | "decrescendo";
  startBeat: Fraction;
  endBeat: Fraction;
  startTimeSec: number;
  endTimeSec: number;
  curve: "linear" | "ease-in" | "ease-out";
  startLevel?: number;
  endLevel?: number;
}

export type TargetRegion = TargetRollRegion | TargetDynamicRegion;

export type DetectedStrokeFlag =
  | "near-clipping"
  | "weak-signal"
  | "possible-double-trigger"
  | "near-recording-boundary";

export interface DetectedStroke {
  id: string;
  sampleIndex: number;
  timeSec: number;
  attackStrengthDbfs: number;
  strokeEnergyDbfs: number;
  relativeAttackDb: number | null;
  relativeEnergyDb: number | null;
  confidence: number;
  flags: DetectedStrokeFlag[];
}

export interface AudioConstraintSnapshot {
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  sampleRate?: number;
}

export interface AudioSettingSnapshot extends AudioConstraintSnapshot {
  deviceId?: string;
}

export interface RecordingMetadata {
  schemaVersion: "1.0";
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  durationSec: number;
  requestedConstraints: AudioConstraintSnapshot;
  appliedSettings: AudioSettingSnapshot;
  clippingSampleRatio: number;
  peakAbs: number;
  rmsDbfs: number;
  startedAt: string;
}

export interface MatcherConfig {
  timingSigmaMs: number;
  maxMatchDistanceMs: number;
  missPenalty: number;
  extraPenalty: number;
  confidencePenaltyWeight: number;
  useAmplitudeInMatching: false;
  offsetSearchRangeMs: number;
  offsetCandidateWindowSize: number;
  unmeasuredRollBoundaryMarginMs: number;
  affineRefinementEnabled: boolean;
  minTimeScale: number;
  maxTimeScale: number;
}

export interface StrokeAlignment {
  matches: StrokeMatch[];
  misses: MissedStroke[];
  extras: ExtraStroke[];
  rollAssignments: RollStrokeAssignment[];
  estimatedOffsetSec: number;
  estimatedTimeScale: number;
  totalCost: number;
}

export interface StrokeMatch {
  targetStrokeId: string;
  detectedStrokeId: string;
  targetTimeSec: number;
  detectedTimeSec: number;
  rawTimingErrorSec: number;
  offsetAdjustedErrorSec: number;
}

export interface MissedStroke {
  targetStrokeId: string;
  targetTimeSec: number;
}

export interface ExtraStroke {
  detectedStrokeId: string;
  detectedTimeSec: number;
  confidence: number;
  possibleDoubleTrigger: boolean;
}

export interface RollStrokeAssignment {
  regionId: string;
  detectedStrokeIds: string[];
}

export type EvaluationStatus =
  "ok" | "insufficient-data" | "low-confidence" | "invalid";

export interface DistributionStats {
  count: number;
  mean: number;
  median: number;
  standardDeviation: number;
  meanAbsolute: number;
  medianAbsolute: number;
  p95Absolute: number;
  minimum: number;
  maximum: number;
}

export interface GroupStats {
  key: string;
  strokeIds: string[];
  stats: DistributionStats;
}

export interface TimingStrokeEvaluation {
  targetStrokeId: string;
  detectedStrokeId: string;
  errorSec: number;
}

export interface TimingEvaluation {
  status: EvaluationStatus;
  reasonCodes: string[];
  toleranceMs: number;
  perStroke: TimingStrokeEvaluation[];
  stats: DistributionStats | null;
  earlyRate: number | null;
  lateRate: number | null;
  withinToleranceRate: number | null;
  byHand: GroupStats[];
  byAccent: GroupStats[];
}

export interface TempoSegmentEvaluation {
  segmentIndex: number;
  targetBpm: number;
  matchedStrokeIds: string[];
  timeScale: number | null;
  actualBpm: number | null;
}

export interface TempoEvaluation {
  status: EvaluationStatus;
  reasonCodes: string[];
  overallTimeScale: number | null;
  overallActualBpm: number | null;
  segments: TempoSegmentEvaluation[];
}

export interface RhythmStrokeEvaluation {
  targetStrokeId: string;
  detectedStrokeId: string;
  residualSec: number;
}

export interface RhythmEvaluation {
  status: EvaluationStatus;
  reasonCodes: string[];
  perStroke: RhythmStrokeEvaluation[];
  residualStats: DistributionStats | null;
  interOnsetIntervalErrorStats: DistributionStats | null;
  byHand: GroupStats[];
}

export interface DynamicsEvaluation {
  status: EvaluationStatus;
  reasonCodes: string[];
  metric: "relativeAttackDb" | "relativeEnergyDb";
  includedDetectedStrokeIds: string[];
  excludedClippedCount: number;
  excludedLowConfidenceCount: number;
  allStrokeStats: DistributionStats | null;
  normalStrokeStats: DistributionStats | null;
  byHand: GroupStats[];
}

export interface AccentStrokeEvaluation {
  targetStrokeId: string;
  detectedStrokeId: string;
  neighborDetectedStrokeIds: string[];
  accentValueDb: number;
  neighborMedianDb: number;
  contrastDb: number;
}

export interface AccentEvaluation {
  status: EvaluationStatus;
  reasonCodes: string[];
  accents: AccentStrokeEvaluation[];
  medianContrastDb: number | null;
  minimumContrastDb: number | null;
  normalStrokeStats: DistributionStats | null;
}

export interface RollEvaluation {
  regionId: string;
  mode: "measured" | "unmeasured";
  status: EvaluationStatus;
  reasonCodes: string[];
  detectedStrokeIds: string[];
  strokeCount: number;
  densityHz: number | null;
  targetDensityHz: number | null;
  densityErrorHz: number | null;
  meanIoiSec: number | null;
  ioiStandardDeviationSec: number | null;
  ioiCv: number | null;
  p95IoiSec: number | null;
  maximumGapSec: number | null;
  leadingGapSec: number | null;
  trailingGapSec: number | null;
  relativeDbStandardDeviation: number | null;
}

export interface DynamicRegionEvaluation {
  regionId: string;
  type: "crescendo" | "decrescendo";
  status: EvaluationStatus;
  reasonCodes: string[];
  detectedStrokeIds: string[];
  slopeDbPerNormalizedTime: number | null;
  spearmanCorrelation: number | null;
  endpointDifferenceDb: number | null;
  directionCorrect: boolean | null;
}

export interface QualityAssessment {
  status: EvaluationStatus;
  reasonCodes: string[];
}

export interface TimingEvaluationConfig {
  withinToleranceMs: number;
}

export interface DynamicsEvaluationConfig {
  metric: "relativeAttackDb" | "relativeEnergyDb";
  minimumConfidence: number;
  accentNeighborCount: number;
}

export interface RollEvaluationConfig {
  minimumStrokeCount: number;
}

export interface PerformanceEvaluation {
  timing: TimingEvaluation;
  tempo: TempoEvaluation;
  internalRhythm: RhythmEvaluation;
  dynamics: DynamicsEvaluation;
  accents: AccentEvaluation;
  rolls: RollEvaluation[];
  dynamicRegions: DynamicRegionEvaluation[];
}

export interface EvaluationResult extends PerformanceEvaluation {
  schemaVersion: "1.0";
  scoreId: string;
  sessionId: string;
  analysisConfigVersion: string;
  recording: RecordingMetadata;
  alignment: StrokeAlignment;
  quality: QualityAssessment;
  generatedAt: string;
}

export interface OnsetDetectorConfig {
  highPassHz: number | null;
  envelopeWindowMs: number;
  noiseFloorWindowMs: number;
  thresholdOffsetDb: number;
  thresholdMadMultiplier: number;
  candidateMinDistanceMs: number;
  refinementLookbackMs: number;
  refinementRiseFraction: number;
  attackWindowMs: number;
  energyWindowMs: number;
  useSpectralFlux: boolean;
  spectralFluxWeight: number;
  confidenceThreshold: number;
}

export interface QualityConfig {
  maximumClippingSampleRatio: number;
}

export interface AnalysisConfig {
  version: string;
  presetName: string;
  onset: OnsetDetectorConfig;
  matcher: MatcherConfig;
  timing: TimingEvaluationConfig;
  dynamics: DynamicsEvaluationConfig;
  roll: RollEvaluationConfig;
  quality: QualityConfig;
}
