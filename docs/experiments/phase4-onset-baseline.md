# Phase 4 onset baseline experiment

- Date: 2026-09-02
- Detector: `phase-4-time-domain-1`
- Preset: `practice-pad-baseline`
- Evaluation tolerance: 25 ms

## Dataset

実録ground truthがまだないため、16 kHz mono、2.4秒の決定的synthetic WAVをsoftware regressionに使用した。7打に弱・中・強の振幅を含め、0.85秒と0.885秒に35 ms間隔のclose doubleを置いた。背景へ固定seedの小振幅noiseを加えている。

このfixtureはCLI、JSON契約、attack refinement、close double、parameter sweepの破壊的変更を検出するためのものであり、実環境の精度を代表しない。

## Baseline result

| Metric              |   Result |
| ------------------- | -------: |
| Truth               |        7 |
| Detected            |        7 |
| Precision           |    1.000 |
| Recall              |    1.000 |
| F1                  |    1.000 |
| Offset-adjusted MAE | 0.027 ms |
| Offset-adjusted P95 | 0.131 ms |

`thresholdOffsetDb = 9, 12, 15` と `refinementRiseFraction = 0.08, 0.10` の6組は、この単純なfixtureでは同値だった。比較値とlabel別rowは `research/onset-poc/experiments/phase4-synthetic-comparison.csv` に保存する。これはparameterを選定できたという意味ではなく、より難しい実録datasetが必要であることを示す。

## Failure review

failure表示を検証するため、意図的に厳しい `thresholdOffsetDb = 42` を適用したところ、4 match、3 miss、F1 0.727となった。診断plotではwaveform、adaptive threshold、candidate、refined attack、truthとmissを同じ時間軸で確認できる。

![Strict-threshold failure review](../../research/onset-poc/experiments/phase4-strict-failure-review.png)

## Next experiment

Phase 7のpreset選定前に、同一interfaceで次を収録する。

- practice pad／snare
- 弱・中・強
- 60／120／180 BPM
- single／double／accent pattern
- 複数のマイク距離・向き
- 通常マイクとピエゾを同一interfaceで同時収録

最初の評価単位を合計500打以上とし、全体平均だけでなく上記のstratified metricsとfailure plotを確認する。
