import { useCallback, useMemo, useState } from "react";
import {
  createDenseDemoScenario,
  createGoldenDemoScenario,
} from "./fixtures/demo-scenarios";
import { StatisticsPanel } from "./ui/session/StatisticsPanel";
import { TimelineCanvas, type TimelineSelection } from "./ui/timeline";
import "./styles.css";

type ScenarioId = "golden" | "dense";

export function App() {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("golden");
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand-line">
            <span className="brand-mark" aria-hidden="true">
              RG
            </span>
            <p className="eyebrow">Rhythm grading · Phase 3</p>
          </div>
          <h1>{scenario.title}</h1>
          <p className="app-description">{scenario.description}</p>
        </div>
        <label className="fixture-picker">
          <span>Preview fixture</span>
          <select
            value={scenarioId}
            onChange={(event) =>
              setScenarioId(event.target.value as ScenarioId)
            }
          >
            <option value="golden">Golden exercise</option>
            <option value="dense">Dense · 4,000 strokes</option>
          </select>
        </label>
      </header>

      <section className="session-strip" aria-label="Session summary">
        <div>
          <span>Target</span>
          <strong>
            {scenario.data.target.strokes.length.toLocaleString()}
          </strong>
        </div>
        <div>
          <span>Detected</span>
          <strong>{scenario.data.detected.length.toLocaleString()}</strong>
        </div>
        <div>
          <span>Matched</span>
          <strong>
            {scenario.data.alignment.matches.length.toLocaleString()}
          </strong>
        </div>
        <div className="session-miss">
          <span>Miss</span>
          <strong>{scenario.data.alignment.misses.length}</strong>
        </div>
        <div className="session-extra">
          <span>Extra</span>
          <strong>{scenario.data.alignment.extras.length}</strong>
        </div>
        <div>
          <span>Analysis</span>
          <strong className="analysis-ready">Synthetic · ready</strong>
        </div>
      </section>

      <div className="workspace-grid">
        <TimelineCanvas
          data={scenario.data}
          selection={selection}
          onSelectionChange={changeSelection}
        />
        <StatisticsPanel
          data={scenario.data}
          evaluation={scenario.evaluation}
          selection={selection}
          onSelectionChange={changeSelection}
        />
      </div>
    </main>
  );
}
