# ADR 0003: Phase 4 onset reference decisions

- Status: Accepted
- Date: 2026-09-02

## Decisions

1. baseline detectorは時間領域を主とし、causal high-pass、短時間RMS envelope、local median/MAD threshold、envelope peak、backward refinementの順に処理する。最大振幅時刻をattack timeにせず、将来Web Workerへ移植しやすい決定的な処理にするためである。
2. `detect`の出力はmetadata wrapperを付けない `DetectedStroke[]` とする。Phase 0–3のTypeScript Domainへ変換なしで入力でき、detector versionとpresetはCLI configおよび実験記録で追跡する。
3. multi-channel WAVは既定でmono平均し、`--channel`で明示選択できる。ピエゾtruth生成で別channelを利用するときに、通常マイク経路と混同しないためである。
4. detector評価はWebのscore Matcherを再利用しない。truth matchingは許容窓を明示し、定常offsetだけをrobust medianで除去してprecision、recall、F1、FP/min、timing errorを返す。検出器評価と演奏採点では目的とpenaltyが異なるためである。
5. confidenceが設定閾値の半分未満のcandidateはringing tailの再交差として出力せず、半分以上・閾値未満は `weak-signal` として保持する。この規則も実録sweepで再評価する。
6. NumPy、SciPy、soundfile、matplotlibを使用する。baselineではspectral fluxを無効とし、librosaはまだ依存へ追加しない。spectral方式を比較する実験を追加するときに導入可否を判断する。
7. 仕様のconfig例へ `nearClippingThresholdDbfs` を追加し、PythonとTypeScriptの両方で同じ名称・単位を使う。near-clipping判定をコード内の固定値にしないためである。

## Specification differences and deferred work

- 収録済みpractice pad／snareとピエゾground truthが提供されていないため、Phase 4の数値はsynthetic fixtureによるsoftware regressionであり、仕様第18.5節の暫定精度gateを達成した証拠とはしない。
- `practice-pad-baseline` は調整開始点であり、製品の `practice-pad-default` または `snare-default` ではない。500打以上の条件別実録sweep後にPhase 7で選定する。
- spectral flux、HFC、click除去はbaseline比較対象として保留する。現在のconfigは `useSpectralFlux: true` を明示的に拒否し、未実装機能を黙って無視しない。
