# ADR 0004: Phase 5 browser audio integration

- Status: Accepted
- Date: 2026-09-03

## Decisions

1. Browser captureは `AudioSource` interfaceの下へ置き、`getUserMedia -> MediaStreamAudioSourceNode -> AudioWorkletNode` でmono Float32 PCMを得る。MediaRecorder圧縮音声は解析原本にしない。
2. AudioWorkletは2048 frameごとの収集・mono mix・transferだけを担当し、DSPを実行しない。停止messageでは残りchunkをflushしてackし、メイン側がack後にnode、track、AudioContextを必ず解放する。
3. 要求constraintと `MediaStreamTrack.getSettings()` の実値を別々に保存する。PCMはWorklet入力でmonoへ統一するためRecordingMetadataのchannel countは1とし、デバイス側の実channel countはapplied settingsに残す。AGC、noise suppression、echo cancellationがfalse以外または未報告なら、無効化できたと仮定せずquality warningを返す。
4. Phase 4のcausal high-pass、RMS envelope、local median/MAD threshold、peak選択、backward refinementをpure TypeScriptへ移植する。local robust統計は2 heapのsliding medianで計算し、共有WAVに対するevent count、attack sample、dBをgolden testでPython referenceと比較する。
5. 録音停止後の解析はmodule Web Workerで実行し、PCMのArrayBufferをtransferする。Timeline用にはtransfer前に最大4096 bucketのmin/max waveform overviewを作り、raw PCMのコピーをUIへ保持しない。
6. 録音use-caseは `PcmRecording -> DetectedStroke[] -> Matcher -> Evaluator -> EvaluationResult` を組み立てるだけとし、Audio、DSP、matching、evaluationの責務は分離する。
7. quality thresholdはversion付き `AnalysisConfig` に置く。clipping sample ratio、入力RMS、low-confidence率に加え、適用されたブラウザ処理をreason codeと行動可能な文言で表示する。

## Specification differences and deferred work

- CIでは実マイク権限を要求せず、共有PCMを注入した統合testとBrowserAudioSourceのmock testを使う。デスクトップChrome／Edgeでの実機確認は手動確認項目とする。
- SharedArrayBufferはcross-origin isolationを必要とするため採用せず、Phase 5ではWorklet chunkと解析用全PCMにtransferable ArrayBufferを使う。5分録音の実測後、必要ならring buffer／WASMと合わせて再検討する。
- スピーカーclickの自動混入判定はmetronome信号がまだないため実装しない。UIでヘッドホン利用を明記し、既知click除去は将来モジュールとする。
- Phase 4 presetはsynthetic回帰用であり、practice pad／snareの製品presetとして校正済みとは扱わない。実録500打以上でのparameter選定はPhase 7で行う。
