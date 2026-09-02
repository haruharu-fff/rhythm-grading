import type { PerformanceEvaluation } from "../../domain";
import { fractionKey } from "../../score";
import type { TimelineData, TimelineSelection } from "../timeline";

interface StatisticsPanelProps {
  data: TimelineData;
  evaluation: PerformanceEvaluation;
  selection: TimelineSelection | null;
  onSelectionChange: (selection: TimelineSelection | null) => void;
}

function milliseconds(seconds: number | null | undefined): string {
  return seconds === null || seconds === undefined
    ? "—"
    : `${(seconds * 1000).toFixed(1)} ms`;
}

function signedMilliseconds(seconds: number): string {
  const value = seconds * 1000;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)} ms`;
}

function decibels(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)} dB`;
}

function percentage(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function barWidth(value: number | null): string {
  return `${Math.round((value ?? 0) * 100)}%`;
}

function statusLabel(status: string): string {
  return status === "ok" ? "Ready" : status.replaceAll("-", " ");
}

function SelectedDetail({ data, evaluation, selection }: StatisticsPanelProps) {
  if (selection === null) {
    return (
      <div className="selection-empty">
        <span className="selection-crosshair">＋</span>
        <p>Select a target, actual stroke, miss, extra, or region.</p>
      </div>
    );
  }
  if (selection.kind === "target") {
    const stroke = data.target.strokes.find(
      (candidate) => candidate.id === selection.id,
    );
    if (stroke === undefined)
      return <p>Selected target is outside this result.</p>;
    const match = data.alignment.matches.find(
      (candidate) => candidate.targetStrokeId === stroke.id,
    );
    const missed = data.alignment.misses.some(
      (candidate) => candidate.targetStrokeId === stroke.id,
    );
    const error =
      match === undefined
        ? null
        : match.detectedTimeSec -
          data.alignment.estimatedOffsetSec -
          match.targetTimeSec;
    return (
      <div className="selection-detail">
        <div className="selection-heading">
          <span
            className={`status-dot ${missed ? "status-miss" : "status-target"}`}
          />
          <div>
            <small>Target stroke</small>
            <strong>{stroke.sourceStrokeId ?? stroke.id}</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Beat</dt>
            <dd>{fractionKey(stroke.beat)}</dd>
          </div>
          <div>
            <dt>Target time</dt>
            <dd>{stroke.timeSec.toFixed(3)} s</dd>
          </div>
          <div>
            <dt>Timing</dt>
            <dd>
              {error === null
                ? missed
                  ? "MISS"
                  : "—"
                : signedMilliseconds(error)}
            </dd>
          </div>
          <div>
            <dt>Hand / accent</dt>
            <dd>
              {stroke.hand} / {stroke.accent ? "yes" : "no"}
            </dd>
          </div>
        </dl>
      </div>
    );
  }
  if (selection.kind === "detected") {
    const stroke = data.detected.find(
      (candidate) => candidate.id === selection.id,
    );
    if (stroke === undefined)
      return <p>Selected actual stroke is outside this result.</p>;
    const match = data.alignment.matches.find(
      (candidate) => candidate.detectedStrokeId === stroke.id,
    );
    const extra = data.alignment.extras.some(
      (candidate) => candidate.detectedStrokeId === stroke.id,
    );
    const error =
      match === undefined
        ? null
        : stroke.timeSec -
          data.alignment.estimatedOffsetSec -
          match.targetTimeSec;
    return (
      <div className="selection-detail">
        <div className="selection-heading">
          <span
            className={`status-dot ${extra ? "status-extra" : "status-actual"}`}
          />
          <div>
            <small>Actual stroke</small>
            <strong>{stroke.id}</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Aligned time</dt>
            <dd>
              {(stroke.timeSec - data.alignment.estimatedOffsetSec).toFixed(3)}{" "}
              s
            </dd>
          </div>
          <div>
            <dt>Timing</dt>
            <dd>
              {extra
                ? "EXTRA"
                : error === null
                  ? "Roll stroke"
                  : signedMilliseconds(error)}
            </dd>
          </div>
          <div>
            <dt>Attack</dt>
            <dd>{stroke.attackStrengthDbfs.toFixed(1)} dBFS</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{percentage(stroke.confidence)}</dd>
          </div>
        </dl>
        {stroke.flags.length > 0 && (
          <p className="detail-note">Flags: {stroke.flags.join(", ")}</p>
        )}
      </div>
    );
  }
  const region = data.target.regions.find(
    (candidate) => candidate.id === selection.id,
  );
  if (region === undefined)
    return <p>Selected region is outside this result.</p>;
  const roll = evaluation.rolls.find(
    (candidate) => candidate.regionId === region.id,
  );
  const dynamic = evaluation.dynamicRegions.find(
    (candidate) => candidate.regionId === region.id,
  );
  return (
    <div className="selection-detail">
      <div className="selection-heading">
        <span className="status-dot status-region" />
        <div>
          <small>Region</small>
          <strong>{region.sourceRegionId}</strong>
        </div>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Type</dt>
          <dd>
            {region.type === "roll" ? `${region.mode} roll` : region.type}
          </dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>
            {region.startTimeSec.toFixed(2)}–{region.endTimeSec.toFixed(2)} s
          </dd>
        </div>
        {roll !== undefined && (
          <div>
            <dt>Density</dt>
            <dd>{roll.densityHz?.toFixed(2) ?? "—"} Hz</dd>
          </div>
        )}
        {roll !== undefined && (
          <div>
            <dt>Max gap</dt>
            <dd>{milliseconds(roll.maximumGapSec)}</dd>
          </div>
        )}
        {dynamic !== undefined && (
          <div>
            <dt>Trend</dt>
            <dd>
              {dynamic.directionCorrect === null
                ? "—"
                : dynamic.directionCorrect
                  ? "Expected"
                  : "Opposite"}
            </dd>
          </div>
        )}
        {dynamic !== undefined && (
          <div>
            <dt>Spearman</dt>
            <dd>{dynamic.spearmanCorrelation?.toFixed(2) ?? "—"}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function StatisticsPanel(props: StatisticsPanelProps) {
  const { data, evaluation } = props;
  const timing = evaluation.timing.stats;
  const rhythm = evaluation.internalRhythm.residualStats;
  const tempo = evaluation.tempo.overallActualBpm;
  return (
    <aside className="statistics-panel" aria-label="Performance statistics">
      <section className="panel-section selection-panel">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">Inspector</p>
            <h2>Selection</h2>
          </div>
        </div>
        <SelectedDetail {...props} />
      </section>

      <section className="panel-section">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">Overview</p>
            <h2>Timing</h2>
          </div>
          <span className={`status-pill status-${evaluation.timing.status}`}>
            {statusLabel(evaluation.timing.status)}
          </span>
        </div>
        <div className="metric-grid">
          <article>
            <span>Click MAE</span>
            <strong>{milliseconds(timing?.meanAbsolute)}</strong>
            <small>offset removed</small>
          </article>
          <article>
            <span>Internal MAE</span>
            <strong>{milliseconds(rhythm?.meanAbsolute)}</strong>
            <small>offset + trend removed</small>
          </article>
          <article>
            <span>Actual tempo</span>
            <strong>
              {tempo === null ? "By segment" : `${tempo.toFixed(1)} BPM`}
            </strong>
            <small>scale ×{data.alignment.estimatedTimeScale.toFixed(3)}</small>
          </article>
          <article>
            <span>Within tolerance</span>
            <strong>{percentage(evaluation.timing.withinToleranceRate)}</strong>
            <small>±{evaluation.timing.toleranceMs} ms</small>
          </article>
        </div>
        <div className="timing-balance" aria-label="Early and late rates">
          <span>Early {percentage(evaluation.timing.earlyRate)}</span>
          <div>
            <i style={{ width: barWidth(evaluation.timing.earlyRate) }} />
            <b style={{ width: barWidth(evaluation.timing.lateRate) }} />
          </div>
          <span>Late {percentage(evaluation.timing.lateRate)}</span>
        </div>
      </section>

      <section className="panel-section compact-stats">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">Detection</p>
            <h2>Events</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>Matched</dt>
            <dd>{data.alignment.matches.length}</dd>
          </div>
          <div>
            <dt>Miss</dt>
            <dd className="metric-miss">{data.alignment.misses.length}</dd>
          </div>
          <div>
            <dt>Extra</dt>
            <dd className="metric-extra">{data.alignment.extras.length}</dd>
          </div>
          <div>
            <dt>Start offset</dt>
            <dd>{signedMilliseconds(data.alignment.estimatedOffsetSec)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel-section compact-stats">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">Control</p>
            <h2>Dynamics</h2>
          </div>
          <span className={`status-pill status-${evaluation.dynamics.status}`}>
            {statusLabel(evaluation.dynamics.status)}
          </span>
        </div>
        <dl>
          <div>
            <dt>Normal spread</dt>
            <dd>
              {decibels(
                evaluation.dynamics.normalStrokeStats?.standardDeviation,
              )}
            </dd>
          </div>
          <div>
            <dt>Accent median</dt>
            <dd>{decibels(evaluation.accents.medianContrastDb)}</dd>
          </div>
          <div>
            <dt>Clipped excluded</dt>
            <dd>{evaluation.dynamics.excludedClippedCount}</dd>
          </div>
          <div>
            <dt>Low confidence</dt>
            <dd>{evaluation.dynamics.excludedLowConfidenceCount}</dd>
          </div>
        </dl>
      </section>

      {evaluation.rolls.length > 0 && (
        <section className="panel-section roll-table-section">
          <div className="panel-title-row">
            <div>
              <p className="section-kicker">Regions</p>
              <h2>Rolls</h2>
            </div>
          </div>
          <div className="roll-table">
            {evaluation.rolls.map((roll) => (
              <button
                type="button"
                key={roll.regionId}
                onClick={() =>
                  props.onSelectionChange({ kind: "region", id: roll.regionId })
                }
                className="roll-row"
              >
                <span>
                  <strong>{roll.regionId.replace("region:", "")}</strong>
                  <small>{roll.mode}</small>
                </span>
                <span>
                  <small>Density</small>
                  {roll.densityHz?.toFixed(2) ?? "—"} Hz
                </span>
                <span>
                  <small>IOI CV</small>
                  {roll.ioiCv?.toFixed(3) ?? "—"}
                </span>
                <span>
                  <small>Max gap</small>
                  {milliseconds(roll.maximumGapSec)}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
