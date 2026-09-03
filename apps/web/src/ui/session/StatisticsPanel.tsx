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
  const labels: Record<string, string> = {
    ok: "評価完了",
    "insufficient-data": "データ不足",
    "low-confidence": "信頼度低",
    invalid: "評価不可",
  };
  return labels[status] ?? status;
}

function flagLabel(flag: string): string {
  const labels: Record<string, string> = {
    "near-clipping": "クリップ付近",
    "weak-signal": "信号が弱い",
    "possible-double-trigger": "二重検出の可能性",
    "near-recording-boundary": "録音端付近",
  };
  return labels[flag] ?? flag;
}

function regionTypeLabel(type: string, mode?: string): string {
  if (type === "roll")
    return mode === "measured" ? "計測ロール" : "非計測ロール";
  if (type === "crescendo") return "クレッシェンド";
  if (type === "decrescendo") return "デクレッシェンド";
  return type;
}

function SelectedDetail({ data, evaluation, selection }: StatisticsPanelProps) {
  if (selection === null) {
    return (
      <div className="selection-empty">
        <span className="selection-crosshair">＋</span>
        <p>
          目標／実際の打点、ミス、余分な打点、または区間を選択してください。
        </p>
      </div>
    );
  }
  if (selection.kind === "target") {
    const stroke = data.target.strokes.find(
      (candidate) => candidate.id === selection.id,
    );
    if (stroke === undefined)
      return <p>選択した目標打点は現在の結果に含まれていません。</p>;
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
            <small>目標打点</small>
            <strong>{stroke.sourceStrokeId ?? stroke.id}</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>拍位置</dt>
            <dd>{fractionKey(stroke.beat)}</dd>
          </div>
          <div>
            <dt>目標時刻</dt>
            <dd>{stroke.timeSec.toFixed(3)} s</dd>
          </div>
          <div>
            <dt>タイミング</dt>
            <dd>
              {error === null
                ? missed
                  ? "ミス"
                  : "—"
                : signedMilliseconds(error)}
            </dd>
          </div>
          <div>
            <dt>手順／アクセント</dt>
            <dd>
              {stroke.hand} / {stroke.accent ? "あり" : "なし"}
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
      return <p>選択した実際の打点は現在の結果に含まれていません。</p>;
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
            <small>実際の打点</small>
            <strong>{stroke.id}</strong>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>補正後の時刻</dt>
            <dd>
              {(stroke.timeSec - data.alignment.estimatedOffsetSec).toFixed(3)}{" "}
              s
            </dd>
          </div>
          <div>
            <dt>タイミング</dt>
            <dd>
              {extra
                ? "余分"
                : error === null
                  ? "ロール打点"
                  : signedMilliseconds(error)}
            </dd>
          </div>
          <div>
            <dt>アタック</dt>
            <dd>{stroke.attackStrengthDbfs.toFixed(1)} dBFS</dd>
          </div>
          <div>
            <dt>信頼度</dt>
            <dd>{percentage(stroke.confidence)}</dd>
          </div>
        </dl>
        {stroke.flags.length > 0 && (
          <p className="detail-note">
            注意: {stroke.flags.map(flagLabel).join("、")}
          </p>
        )}
      </div>
    );
  }
  const region = data.target.regions.find(
    (candidate) => candidate.id === selection.id,
  );
  if (region === undefined)
    return <p>選択した区間は現在の結果に含まれていません。</p>;
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
          <small>区間</small>
          <strong>{region.sourceRegionId}</strong>
        </div>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>種類</dt>
          <dd>
            {regionTypeLabel(
              region.type,
              region.type === "roll" ? region.mode : undefined,
            )}
          </dd>
        </div>
        <div>
          <dt>範囲</dt>
          <dd>
            {region.startTimeSec.toFixed(2)}–{region.endTimeSec.toFixed(2)} s
          </dd>
        </div>
        {roll !== undefined && (
          <div>
            <dt>打点密度</dt>
            <dd>{roll.densityHz?.toFixed(2) ?? "—"} Hz</dd>
          </div>
        )}
        {roll !== undefined && (
          <div>
            <dt>最大間隔</dt>
            <dd>{milliseconds(roll.maximumGapSec)}</dd>
          </div>
        )}
        {dynamic !== undefined && (
          <div>
            <dt>強弱の傾向</dt>
            <dd>
              {dynamic.directionCorrect === null
                ? "—"
                : dynamic.directionCorrect
                  ? "指定どおり"
                  : "指定と逆"}
            </dd>
          </div>
        )}
        {dynamic !== undefined && (
          <div>
            <dt>Spearman相関</dt>
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
    <aside className="statistics-panel" aria-label="演奏の統計">
      <section className="panel-section selection-panel">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">詳細</p>
            <h2>選択項目</h2>
          </div>
        </div>
        <SelectedDetail {...props} />
      </section>

      <section className="panel-section">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">概要</p>
            <h2>タイミング</h2>
          </div>
          <span className={`status-pill status-${evaluation.timing.status}`}>
            {statusLabel(evaluation.timing.status)}
          </span>
        </div>
        <div className="metric-grid">
          <article>
            <span>クリック基準 MAE</span>
            <strong>{milliseconds(timing?.meanAbsolute)}</strong>
            <small>開始ずれを除外</small>
          </article>
          <article>
            <span>内部リズム MAE</span>
            <strong>{milliseconds(rhythm?.meanAbsolute)}</strong>
            <small>開始ずれ・テンポ傾向を除外</small>
          </article>
          <article>
            <span>実演テンポ</span>
            <strong>
              {tempo === null ? "区間ごと" : `${tempo.toFixed(1)} BPM`}
            </strong>
            <small>
              時間倍率 ×{data.alignment.estimatedTimeScale.toFixed(3)}
            </small>
          </article>
          <article>
            <span>許容範囲内</span>
            <strong>{percentage(evaluation.timing.withinToleranceRate)}</strong>
            <small>±{evaluation.timing.toleranceMs} ms</small>
          </article>
        </div>
        <div className="timing-balance" aria-label="早い打点と遅い打点の割合">
          <span>早い {percentage(evaluation.timing.earlyRate)}</span>
          <div>
            <i style={{ width: barWidth(evaluation.timing.earlyRate) }} />
            <b style={{ width: barWidth(evaluation.timing.lateRate) }} />
          </div>
          <span>遅い {percentage(evaluation.timing.lateRate)}</span>
        </div>
      </section>

      <section className="panel-section compact-stats">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">検出</p>
            <h2>打点</h2>
          </div>
        </div>
        <dl>
          <div>
            <dt>一致</dt>
            <dd>{data.alignment.matches.length}</dd>
          </div>
          <div>
            <dt>ミス</dt>
            <dd className="metric-miss">{data.alignment.misses.length}</dd>
          </div>
          <div>
            <dt>余分</dt>
            <dd className="metric-extra">{data.alignment.extras.length}</dd>
          </div>
          <div>
            <dt>開始ずれ</dt>
            <dd>{signedMilliseconds(data.alignment.estimatedOffsetSec)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel-section compact-stats">
        <div className="panel-title-row">
          <div>
            <p className="section-kicker">コントロール</p>
            <h2>強弱</h2>
          </div>
          <span className={`status-pill status-${evaluation.dynamics.status}`}>
            {statusLabel(evaluation.dynamics.status)}
          </span>
        </div>
        <dl>
          <div>
            <dt>通常打点のばらつき</dt>
            <dd>
              {decibels(
                evaluation.dynamics.normalStrokeStats?.standardDeviation,
              )}
            </dd>
          </div>
          <div>
            <dt>アクセント差の中央値</dt>
            <dd>{decibels(evaluation.accents.medianContrastDb)}</dd>
          </div>
          <div>
            <dt>クリップ除外数</dt>
            <dd>{evaluation.dynamics.excludedClippedCount}</dd>
          </div>
          <div>
            <dt>低信頼度の除外数</dt>
            <dd>{evaluation.dynamics.excludedLowConfidenceCount}</dd>
          </div>
        </dl>
      </section>

      {evaluation.rolls.length > 0 && (
        <section className="panel-section roll-table-section">
          <div className="panel-title-row">
            <div>
              <p className="section-kicker">区間</p>
              <h2>ロール</h2>
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
                  <small>{roll.mode === "measured" ? "計測" : "非計測"}</small>
                </span>
                <span>
                  <small>打点密度</small>
                  {roll.densityHz?.toFixed(2) ?? "—"} Hz
                </span>
                <span>
                  <small>打点間隔 CV</small>
                  {roll.ioiCv?.toFixed(3) ?? "—"}
                </span>
                <span>
                  <small>最大間隔</small>
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
