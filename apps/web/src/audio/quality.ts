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
    "自動ゲイン調整が有効、または状態を取得できないため、強弱の評価は参考値です。",
  "noise-suppression-not-disabled":
    "ノイズ抑制が有効、または状態を取得できないため、弱い打音を検出できない可能性があります。",
  "echo-cancellation-not-disabled":
    "エコー除去が有効、または状態を取得できません。クリック音にはヘッドホンを使用してください。",
  "clipping-ratio-too-high":
    "入力音が頻繁にクリップしています。マイクを離すか、入力ゲインを下げてください。",
  "input-level-too-low":
    "録音レベルが低すぎます。マイクを近づけるか、入力ゲインを上げてください。",
  "mostly-low-confidence-detections":
    "検出した打音の多くが不確実です。マイクの位置と周囲の雑音を確認してください。",
};
