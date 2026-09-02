# ADR 0002: Phase 3 Canvas timeline decisions

- Status: Accepted
- Date: 2026-09-02

## Decisions

1. Canvasは1要素に集約し、描画処理をgrid、regions、matching、target、detected、selectionの概念layerへ分ける。重なり順を決定的に保ちつつ、将来は特定layerだけをoffscreen canvasへ移せるためである。
2. viewport、座標変換、scene生成、表示範囲culling、hit testはReact/DOMに依存しない純粋TypeScriptとする。Canvasの描画結果そのものではなく、描画入力となるglyphをunit testできる。
3. actualの横位置はclick timingと同じ `detectedTime - estimatedOffset` とする。affine scaleまで除去すると演奏全体のテンポ差がタイムライン上で見えなくなるためである。internal rhythmのaffine residualは統計パネルに別表示する。
4. early/late、miss/extraは色だけに依存せず、形状と `E` / `L` / `MISS` / `EXTRA` の文字でも区別する。
5. 4,000打のUI性能fixtureはDP Matcherを実行せず、決定的な既知alignmentを生成してEvaluatorへ渡す。現行の完全DPは $O(KNM)$ であり、このfixtureの目的はPhase 3の表示範囲cullingと操作性の検証だからである。Matcherの数千打対応はbanded DPを導入する別変更で扱う。

## Specification differences and deferred work

- 波形layerの描画順を追加できる境界は維持するが、Phase 3時点ではPCMまたは波形envelopeのDomain入力が存在しないため表示しない。実録入力を追加するPhase 4以降で接続する。
- 実ブラウザの自動E2Eは追加していない。viewport/scene/hit testはVitestで検証し、React/Canvas結合のE2Eは録音・再生UIと合わせて後続Phaseで導入する。
