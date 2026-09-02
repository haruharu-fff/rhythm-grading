# Phase 0–4 architecture

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

TargetPerformance + DetectedStroke[] + StrokeAlignment
  -> Timeline viewport / scene (pure TypeScript)
  -> high-DPI Canvas renderer

PerformanceEvaluation + Timeline selection
  -> Statistics panel / inspector

WAV -> Python baseline OnsetDetector -> DetectedStroke[]
GroundTruth + DetectedStroke[] -> detection metrics
Dataset + config grid -> stratified sweep CSV / experiment report
```

`domain` はデータ契約だけを所有し、React、DOM、Web Audio、永続化をimportしません。この制約はESLintでも検査します。`score`、`matching`、`evaluation` はブラウザ状態を参照しない純粋ロジックです。UIはこれらを呼び出せますが、逆向きの依存は禁止します。

Phase 3のCanvasは次の概念layerを順に描画します。

1. beat/subdivision grid
2. roll/dynamic regions
3. targetとactualを結ぶmatch線
4. target strokes
5. detected strokes、miss/extra表現
6. selection

viewport演算、表示範囲culling、scene生成、hit testはDOMから分離した純粋TypeScriptです。Canvasはdevice pixel ratioに合わせたbacking storeを持ち、ResizeObserverで表示幅へ追従します。数千打fixtureでは全データを保持したまま、現在のviewportと小さなoverscanに入るglyphだけを生成します。

将来の境界は次のとおりです。

- Audio: PCM取得と `RecordingMetadata` の生成
- DSP: PCMから `DetectedStroke[]` への変換
- Worker: DSPの実行場所だけを差し替え、Domain I/Oは維持
- Timeline waveform layer: PCMまたはdownsample済みenvelopeをread-onlyで追加
- Storage: score/session snapshotをRepository interface経由で保存
- Python PoC: 共有JSON契約へ出力し、Web側のMatcher/Evaluator fixtureと接続

Python PoCはWebのscore Matcherとは別に、ピエゾ等のground truthと検出結果を許容窓内で対応付ける評価matcherを持ちます。前者は演奏採点、後者は検出器自体のprecision／recall測定という異なる責務です。定常マイク・ピエゾoffsetだけをrobust medianで除去し、miss／extraを保持します。

offset候補ごとに完全DPを実行するため、現在の計算量は候補数を $K$、正解打点数を $N$、検出打点数を $M$ として $O(KNM)$ です。Phase 2の短い練習では最適性と検証容易性を優先し、長時間fixtureを導入してからtime gateによるband化を行います。
