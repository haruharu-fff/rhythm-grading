import scoreFixture from "../../../fixtures/scores/phase2-golden-score.json";
import { scoreCompiler, validateScoreDocument } from "./score";
import "./styles.css";

export function App() {
  const validation = validateScoreDocument(scoreFixture);
  if (!validation.valid) {
    return (
      <main>
        <h1>Rhythm Grading</h1>
        <p>Fixture validation failed.</p>
        <pre>{JSON.stringify(validation.issues, null, 2)}</pre>
      </main>
    );
  }
  const compiled = scoreCompiler.compile(validation.value);
  return (
    <main>
      <p className="eyebrow">Phase 0–2 foundation</p>
      <h1>{validation.value.title}</h1>
      <p>
        The shared JSON fixture was validated and compiled without browser audio
        or UI-layer domain logic.
      </p>
      <dl>
        <div>
          <dt>Duration</dt>
          <dd>{compiled.durationSec.toFixed(3)} s</dd>
        </div>
        <div>
          <dt>Target strokes</dt>
          <dd>{compiled.strokes.length}</dd>
        </div>
        <div>
          <dt>Target regions</dt>
          <dd>{compiled.regions.length}</dd>
        </div>
        <div>
          <dt>Tempo segments</dt>
          <dd>{compiled.tempoMap.length}</dd>
        </div>
      </dl>
      <details>
        <summary>Compiled TargetPerformance</summary>
        <pre>{JSON.stringify(compiled, null, 2)}</pre>
      </details>
    </main>
  );
}
