# Phase 0–2 architecture

```text
shared score JSON
  -> validation / Fraction
  -> tempo map / ScoreCompiler
  -> TargetPerformance

TargetPerformance -> synthetic generator -> DetectedStroke[]

TargetPerformance + DetectedStroke[]
  -> DP Matcher
  -> StrokeAlignment
  -> Evaluator
  -> PerformanceEvaluation
```

`domain` はデータ契約だけを所有し、React、DOM、Web Audio、永続化をimportしません。この制約はESLintでも検査します。`score`、`matching`、`evaluation` はブラウザ状態を参照しない純粋ロジックです。UIはこれらを呼び出せますが、逆向きの依存は禁止します。

将来の境界は次のとおりです。

- Audio: PCM取得と `RecordingMetadata` の生成
- DSP: PCMから `DetectedStroke[]` への変換
- Worker: DSPの実行場所だけを差し替え、Domain I/Oは維持
- Timeline: `TargetPerformance`、`DetectedStroke[]`、`StrokeAlignment`、評価結果をread-onlyで描画
- Storage: score/session snapshotをRepository interface経由で保存
- Python PoC: 共有JSON契約へ出力し、Web側のMatcher/Evaluator fixtureと接続

offset候補ごとに完全DPを実行するため、現在の計算量は候補数を $K$、正解打点数を $N$、検出打点数を $M$ として $O(KNM)$ です。Phase 2の短い練習では最適性と検証容易性を優先し、長時間fixtureを導入してからtime gateによるband化を行います。
