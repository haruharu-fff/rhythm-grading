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
  if (value === false) return "off";
  if (value === true) return "on";
  return "unreported";
}

function errorMessage(error: unknown): string {
  if (error instanceof BrowserAudioError) return error.message;
  if (error instanceof Error) return error.message;
  return "Recording failed. Check the microphone and try again.";
}

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
        Start recording
      </button>
    ) : state === "recording" ? (
      <button
        type="button"
        className="record-button is-recording"
        onClick={() => void stopAndAnalyze()}
      >
        Stop &amp; analyze
      </button>
    ) : (
      <button
        type="button"
        className="record-button"
        disabled={state === "requesting-permission" || state === "processing"}
        onClick={() => void prepare()}
      >
        {state === "requesting-permission"
          ? "Requesting permission…"
          : state === "processing"
            ? "Analyzing offline…"
            : state === "completed"
              ? "Record again"
              : "Enable microphone"}
      </button>
    );

  return (
    <section className="recorder-panel" aria-labelledby="recorder-title">
      <div className="recorder-copy">
        <p className="section-kicker">Browser audio</p>
        <h2 id="recorder-title">Record this exercise</h2>
        <p>
          Audio stays in this browser. Use headphones for the click; microphone
          permission is requested only when you enable recording.
        </p>
      </div>
      <div className="recorder-actions">
        <span className={`recording-state state-${state}`}>{state}</span>
        {action}
      </div>
      {sourceInfo !== null && (
        <dl className="audio-settings" aria-label="Applied audio settings">
          <div>
            <dt>Sample rate</dt>
            <dd>{sourceInfo.sampleRate.toLocaleString()} Hz</dd>
          </div>
          <div>
            <dt>Input → PCM channels</dt>
            <dd>
              {sourceInfo.appliedSettings.channelCount ?? "unreported"} →{" "}
              {sourceInfo.channelCount}
            </dd>
          </div>
          <div>
            <dt>AGC</dt>
            <dd>{settingLabel(sourceInfo.appliedSettings.autoGainControl)}</dd>
          </div>
          <div>
            <dt>Noise suppression</dt>
            <dd>{settingLabel(sourceInfo.appliedSettings.noiseSuppression)}</dd>
          </div>
          <div>
            <dt>Echo cancellation</dt>
            <dd>{settingLabel(sourceInfo.appliedSettings.echoCancellation)}</dd>
          </div>
          {recording !== null && (
            <div>
              <dt>Captured</dt>
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
        <ul
          className="quality-warnings"
          aria-label="Recording quality warnings"
        >
          {qualityReasons.map((reason) => (
            <li key={reason}>{QUALITY_WARNING_MESSAGES[reason] ?? reason}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
