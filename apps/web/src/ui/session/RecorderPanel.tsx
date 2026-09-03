import { useEffect, useRef, useState } from "react";
import {
  BrowserAudioError,
  BrowserAudioSource,
  QUALITY_WARNING_MESSAGES,
} from "../../audio";
import { DEFAULT_ANALYSIS_CONFIG } from "../../config";
import type {
  AudioSourceInfo,
  RecordingMetadata,
  RecordingState,
  TargetPerformance,
} from "../../domain";
import { OnsetWorkerClient } from "../../dsp";
import type { RecordingAnalysis } from "../../session";
import { analyzeRecording } from "../../session";

interface RecorderPanelProps {
  target: TargetPerformance;
  onAnalysis: (analysis: RecordingAnalysis) => void;
}

function settingLabel(value: boolean | undefined): string {
  if (value === false) return "オフ";
  if (value === true) return "オン";
  return "取得不可";
}

function errorMessage(error: unknown): string {
  if (error instanceof BrowserAudioError) {
    const messages: Record<BrowserAudioError["code"], string> = {
      unsupported:
        "このブラウザは録音に必要なWeb Audio APIに対応していません。",
      "permission-denied":
        "マイクへのアクセスが拒否されました。アクセスを許可して、もう一度お試しください。",
      "device-unavailable":
        "使用できるマイクが見つかりません。入力デバイスを確認してください。",
      "invalid-state":
        "録音の状態が正しくありません。最初からやり直してください。",
      "worklet-failed":
        "録音処理を開始できませんでした。ページを再読み込みしてください。",
      "capture-failed":
        "マイク録音に失敗しました。他のアプリでマイクを使用していないか確認してください。",
    };
    return messages[error.code];
  }
  return "録音または解析に失敗しました。マイクを確認して、もう一度お試しください。";
}

const RECORDING_STATE_LABELS: Record<RecordingState, string> = {
  idle: "待機中",
  "requesting-permission": "許可を確認中",
  ready: "録音準備完了",
  recording: "録音中",
  processing: "解析中",
  completed: "完了",
  error: "エラー",
};

export function RecorderPanel({ target, onAnalysis }: RecorderPanelProps) {
  const sourceRef = useRef<BrowserAudioSource | null>(null);
  const detectorRef = useRef<OnsetWorkerClient | null>(null);
  const [state, setState] = useState<RecordingState>("idle");
  const [sourceInfo, setSourceInfo] = useState<AudioSourceInfo | null>(null);
  const [recording, setRecording] = useState<RecordingMetadata | null>(null);
  const [qualityReasons, setQualityReasons] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      void sourceRef.current?.dispose();
      detectorRef.current?.dispose();
    },
    [],
  );

  const prepare = async (): Promise<void> => {
    setError(null);
    setQualityReasons([]);
    setSourceInfo(null);
    setRecording(null);
    setState("requesting-permission");
    try {
      sourceRef.current ??= new BrowserAudioSource(
        DEFAULT_ANALYSIS_CONFIG.onset.nearClippingThresholdDbfs,
      );
      const info = await sourceRef.current.prepare();
      setSourceInfo(info);
      setState("ready");
    } catch (cause) {
      setState("error");
      setError(errorMessage(cause));
    }
  };

  const start = async (): Promise<void> => {
    if (sourceRef.current === null) return;
    setError(null);
    try {
      await sourceRef.current.start();
      setState("recording");
    } catch (cause) {
      setState("error");
      setError(errorMessage(cause));
    }
  };

  const stopAndAnalyze = async (): Promise<void> => {
    if (sourceRef.current === null) return;
    setError(null);
    setState("processing");
    try {
      const pcm = await sourceRef.current.stop();
      setRecording(pcm.metadata);
      detectorRef.current ??= new OnsetWorkerClient();
      const analysis = await analyzeRecording(
        target,
        pcm,
        detectorRef.current,
        DEFAULT_ANALYSIS_CONFIG,
        { sessionId: crypto.randomUUID() },
      );
      setQualityReasons(analysis.result.quality.reasonCodes);
      onAnalysis(analysis);
      setState("completed");
    } catch (cause) {
      setState("error");
      setError(errorMessage(cause));
      await sourceRef.current.dispose();
    }
  };

  const action =
    state === "ready" ? (
      <button
        type="button"
        className="record-button"
        onClick={() => void start()}
      >
        録音開始
      </button>
    ) : state === "recording" ? (
      <button
        type="button"
        className="record-button is-recording"
        onClick={() => void stopAndAnalyze()}
      >
        停止して解析
      </button>
    ) : (
      <button
        type="button"
        className="record-button"
        disabled={state === "requesting-permission" || state === "processing"}
        onClick={() => void prepare()}
      >
        {state === "requesting-permission"
          ? "マイクの許可を確認中…"
          : state === "processing"
            ? "ブラウザ内で解析中…"
            : state === "completed"
              ? "もう一度録音"
              : "マイクを有効にする"}
      </button>
    );

  return (
    <section className="recorder-panel" aria-labelledby="recorder-title">
      <div className="recorder-copy">
        <p className="section-kicker">ブラウザ録音</p>
        <h2 id="recorder-title">この譜面を録音する</h2>
        <p>
          音声はブラウザ内だけで処理され、外部には送信されません。クリック音を使う場合はヘッドホンを使用してください。マイクの許可は録音を有効にしたときだけ確認します。
        </p>
      </div>
      <div className="recorder-actions">
        <span className={`recording-state state-${state}`}>
          {RECORDING_STATE_LABELS[state]}
        </span>
        {action}
      </div>
      {sourceInfo !== null && (
        <dl className="audio-settings" aria-label="適用された録音設定">
          <div>
            <dt>サンプルレート</dt>
            <dd>{sourceInfo.sampleRate.toLocaleString()} Hz</dd>
          </div>
          <div>
            <dt>入力 → PCMチャンネル</dt>
            <dd>
              {sourceInfo.appliedSettings.channelCount ?? "取得不可"} →{" "}
              {sourceInfo.channelCount}
            </dd>
          </div>
          <div>
            <dt>自動ゲイン調整（AGC）</dt>
            <dd>{settingLabel(sourceInfo.appliedSettings.autoGainControl)}</dd>
          </div>
          <div>
            <dt>ノイズ抑制</dt>
            <dd>{settingLabel(sourceInfo.appliedSettings.noiseSuppression)}</dd>
          </div>
          <div>
            <dt>エコー除去</dt>
            <dd>{settingLabel(sourceInfo.appliedSettings.echoCancellation)}</dd>
          </div>
          {recording !== null && (
            <div>
              <dt>録音時間</dt>
              <dd>{recording.durationSec.toFixed(2)} s</dd>
            </div>
          )}
        </dl>
      )}
      {error !== null && (
        <p className="recording-error" role="alert">
          {error}
        </p>
      )}
      {qualityReasons.length > 0 && (
        <ul className="quality-warnings" aria-label="録音品質の警告">
          {qualityReasons.map((reason) => (
            <li key={reason}>{QUALITY_WARNING_MESSAGES[reason] ?? reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
