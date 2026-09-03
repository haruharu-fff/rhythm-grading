import { useCallback, useMemo, useState } from "react";
import {
  createDenseDemoScenario,
  createGoldenDemoScenario,
} from "./fixtures/demo-scenarios";
import { StatisticsPanel } from "./ui/session/StatisticsPanel";
import { RecorderPanel } from "./ui/session/RecorderPanel";
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
            <p className="eyebrow">Rhythm grading · Phase 5</p>
          </div>
          <h1>{scenario.title}</h1>
          <p className="app-description">{scenario.description}</p>
        </div>
        <label className="fixture-picker">
          <span>Preview fixture</span>
          <select
            value={scenarioId}
            onChange={(event) =>
              changeScenario(event.target.value as ScenarioId)
            }
          >
            <option value="golden">Golden exercise</option>
            <option value="dense">Dense · 4,000 strokes</option>
          </select>
        </label>
      </header>

      <RecorderPanel
        key={scenario.id}
        target={scenario.data.target}
        onAnalysis={acceptRecordedAnalysis}
      />

      <section className="session-strip" aria-label="Session summary">
        <div>
          <span>Target</span>
          <strong>{data.target.strokes.length.toLocaleString()}</strong>
        </div>
        <div>
          <span>Detected</span>
          <strong>{data.detected.length.toLocaleString()}</strong>
        </div>
        <div>
          <span>Matched</span>
          <strong>{data.alignment.matches.length.toLocaleString()}</strong>
        </div>
        <div className="session-miss">
          <span>Miss</span>
          <strong>{data.alignment.misses.length}</strong>
        </div>
        <div className="session-extra">
          <span>Extra</span>
          <strong>{data.alignment.extras.length}</strong>
        </div>
        <div>
          <span>Analysis</span>
          <strong className="analysis-ready">
            {recordedAnalysis === null
              ? "Synthetic · ready"
              : "Microphone · analyzed"}
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
