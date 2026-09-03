import { assessRecordingQuality, buildWaveformOverview } from "../audio";
import type { WaveformOverview } from "../audio";
import type {
  AnalysisConfig,
  DetectedStroke,
  EvaluationResult,
  PcmRecording,
  TargetPerformance,
} from "../domain";
import type { OfflineOnsetDetector } from "../dsp";
import { evaluatePerformance } from "../evaluation";
import { matchPerformance } from "../matching";

export interface RecordingAnalysis {
  result: EvaluationResult;
  detected: DetectedStroke[];
  waveform: WaveformOverview;
}

export interface RecordingAnalysisOptions {
  sessionId: string;
  generatedAt?: string;
}

export async function analyzeRecording(
  target: TargetPerformance,
  recording: PcmRecording,
  detector: OfflineOnsetDetector,
  config: AnalysisConfig,
  options: RecordingAnalysisOptions,
): Promise<RecordingAnalysis> {
  const waveform = buildWaveformOverview(
    recording.samples,
    recording.metadata.sampleRate,
  );
  const detected = await detector.detect(
    recording.samples,
    recording.metadata.sampleRate,
    config.onset,
  );
  const alignment = matchPerformance(target, detected, config.matcher);
  const performance = evaluatePerformance(target, detected, alignment, config);
  return {
    waveform,
    detected,
    result: {
      schemaVersion: "1.0",
      scoreId: target.scoreId,
      sessionId: options.sessionId,
      analysisConfigVersion: config.version,
      recording: recording.metadata,
      alignment,
      ...performance,
      quality: assessRecordingQuality(
        recording.metadata,
        detected,
        config.quality,
        config.onset.confidenceThreshold,
      ),
      generatedAt: options.generatedAt ?? new Date().toISOString(),
    },
  };
}
