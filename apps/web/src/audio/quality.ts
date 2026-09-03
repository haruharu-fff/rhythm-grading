import type {
  DetectedStroke,
  QualityAssessment,
  QualityConfig,
  RecordingMetadata,
} from "../domain";

export function assessRecordingQuality(
  recording: RecordingMetadata,
  strokes: readonly DetectedStroke[],
  config: QualityConfig,
  confidenceThreshold: number,
): QualityAssessment {
  const reasonCodes: string[] = [];
  if (recording.appliedSettings.autoGainControl !== false) {
    reasonCodes.push("automatic-gain-control-not-disabled");
  }
  if (recording.appliedSettings.noiseSuppression !== false) {
    reasonCodes.push("noise-suppression-not-disabled");
  }
  if (recording.appliedSettings.echoCancellation !== false) {
    reasonCodes.push("echo-cancellation-not-disabled");
  }
  if (recording.clippingSampleRatio >= config.maximumClippingSampleRatio) {
    reasonCodes.push("clipping-ratio-too-high");
  }
  if (recording.rmsDbfs < config.minimumInputRmsDbfs) {
    reasonCodes.push("input-level-too-low");
  }
  if (strokes.length > 0) {
    const lowConfidenceCount = strokes.filter(
      (stroke) =>
        stroke.confidence < confidenceThreshold ||
        stroke.flags.includes("weak-signal"),
    ).length;
    if (lowConfidenceCount / strokes.length > config.maximumLowConfidenceRate) {
      reasonCodes.push("mostly-low-confidence-detections");
    }
  }
  return {
    status: reasonCodes.length === 0 ? "ok" : "low-confidence",
    reasonCodes,
  };
}

export const QUALITY_WARNING_MESSAGES: Readonly<Record<string, string>> = {
  "automatic-gain-control-not-disabled":
    "Automatic gain control is active or unavailable; dynamics are reference-only.",
  "noise-suppression-not-disabled":
    "Noise suppression is active or unavailable; weak strokes may be lost.",
  "echo-cancellation-not-disabled":
    "Echo cancellation is active or unavailable; use headphones for the click.",
  "clipping-ratio-too-high":
    "The input clipped too often. Move the microphone away or lower its gain.",
  "input-level-too-low":
    "The recording level is very low. Move closer or raise the input gain.",
  "mostly-low-confidence-detections":
    "Most detected strokes are uncertain. Check microphone placement and noise.",
};
