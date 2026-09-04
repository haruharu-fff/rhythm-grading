import { useCallback, useMemo, useState } from "react";
import {
  createDenseDemoScenario,
  createGoldenDemoScenario,
} from "./fixtures/demo-scenarios";
import { StatisticsPanel } from "./ui/session/StatisticsPanel";
import { RecorderPanel } from "./ui/session/RecorderPanel";
import { summarizeTempoMap } from "./ui/session/tempo-summary";
import type { RecordingAnalysis } from "./session";
import { TimelineCanvas, type TimelineSelection } from "./ui/timeline";
import "./styles.css";

type ScenarioId = "golden" | "dense";

export function App() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("golden");
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
  const [recordedAnalysis, setRecordedAnalysis] =
    useState<RecordingAnalysis | null>(null);
  const scenario = useMemo(
    () =>
      scenarioId === "golden"
        ? createGoldenDemoScenario()
        : createDenseDemoScenario(),
    [scenarioId],
  );
  const changeSelection = useCallback((next: TimelineSelection | null) => {
    setSelection(next);
  }, []);
  const acceptRecordedAnalysis = useCallback((analysis: RecordingAnalysis) => {
    setRecordedAnalysis(analysis);
    setSelection(null);
  }, []);
  const data = useMemo(
    () =>
      recordedAnalysis === null
        ? scenario.data
        : {
            target: scenario.data.target,
            detected: recordedAnalysis.detected,
            alignment: recordedAnalysis.result.alignment,
            waveform: recordedAnalysis.waveform,
          },
    [recordedAnalysis, scenario.data],
  );
  const evaluation = recordedAnalysis?.result ?? scenario.evaluation;
  const tempo = summarizeTempoMap(scenario.data.target.tempoMap);

  const changeScenario = (next: ScenarioId): void => {
    setScenarioId(next);
    setRecordedAnalysis(null);
    setSelection(null);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand-line">
            <span className="brand-mark" aria-hidden="true">
              RG
            </span>
            <p className="eyebrow">リズム採点 · Phase 5</p>
          </div>
          <h1>{scenario.title}</h1>
          <p className="app-description">{scenario.description}</p>
          <dl className="score-facts" aria-label="譜面情報">
            <div>
              <dt>譜面</dt>
              <dd>動作確認用デモ</dd>
            </div>
            <div>
              <dt>テンポ</dt>
              <dd>
                <strong>{tempo.bpm}</strong>
                <small>{tempo.changes}</small>
              </dd>
            </div>
          </dl>
        </div>
        <label className="fixture-picker">
          <span>デモ譜面</span>
          <select
            value={scenarioId}
            onChange={(event) =>
              changeScenario(event.target.value as ScenarioId)
            }
          >
            <option value="golden">採点機能デモ</option>
            <option value="dense">高密度表示テスト · 4,000打</option>
          </select>
        </label>
      </header>

      <RecorderPanel
        key={scenario.id}
        target={scenario.data.target}
        onAnalysis={acceptRecordedAnalysis}
      />

      <section className="session-strip" aria-label="演奏結果の概要">
        <div>
          <span>目標打点</span>
          <strong>{data.target.strokes.length.toLocaleString()}</strong>
        </div>
        <div>
          <span>検出打点</span>
          <strong>{data.detected.length.toLocaleString()}</strong>
        </div>
        <div>
          <span>一致</span>
          <strong>{data.alignment.matches.length.toLocaleString()}</strong>
        </div>
        <div className="session-miss">
          <span>ミス</span>
          <strong>{data.alignment.misses.length}</strong>
        </div>
        <div className="session-extra">
          <span>余分</span>
          <strong>{data.alignment.extras.length}</strong>
        </div>
        <div>
          <span>解析データ</span>
          <strong className="analysis-ready">
            {recordedAnalysis === null
              ? "人工データ · 準備完了"
              : "マイク録音 · 解析済み"}
          </strong>
        </div>
      </section>

      <div className="workspace-grid">
        <TimelineCanvas
          data={data}
          selection={selection}
          onSelectionChange={changeSelection}
        />
        <StatisticsPanel
          data={data}
          evaluation={evaluation}
          selection={selection}
          onSelectionChange={changeSelection}
        />
      </div>
    </main>
  );
}
