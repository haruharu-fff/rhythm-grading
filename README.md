# rhythm-grading

打楽器の譜面を正解イベント列へ変換し、ブラウザ録音から打点を検出して対応付け・評価・可視化を行うアプリケーションです。現在は仕様書 v0.1 の **Phase 0〜5** を実装しています。

## 必要環境

- Node.js 22以上
- npm 10以上
- Python 3.12以上
- Poetry 2.x（Python PoCの検証時のみ）

## セットアップと実行

```bash
git clone https://github.com/haruharu-fff/rhythm-grading.git
cd rhythm-grading
npm ci
npm run dev
```

開発サーバーが表示するlocalhost URLをデスクトップ版ChromeまたはEdgeで開いてください。Golden exerciseと4,000打のdense fixtureを切り替えてタイムラインを操作でき、`Enable microphone` から録音すると停止後にWeb Workerで解析して結果を同じ画面へ表示します。マイク権限要求前に用途を説明し、音声は外部へ送信しません。クリックを使う場合はヘッドホンを使用してください。

### ブラウザ録音

1. `Enable microphone` を押し、ブラウザの権限ダイアログを許可します。
2. 表示されたsample rate、channel count、AGC等の実適用値を確認します。
3. `Start recording` を押して譜面を演奏します。
4. `Stop & analyze` を押すと、PCM収録を終了してstream／AudioWorkletを解放し、Worker解析後にTimelineと統計を更新します。

マイクはsecure contextでのみ利用できるため、開発時はViteのlocalhostを使用してください。DynamicsはAGC／noise suppression／echo cancellationをブラウザが無効にできなかった場合、またはclipping等を検出した場合に参考値となり、理由を画面へ表示します。

### タイムライン操作

- Canvas上のドラッグ、左右ボタン、左右矢印キー: 水平スクロール
- `Ctrl` / `⌘` + ホイール、`+` / `-` キー、ズームボタン: ズーム
- `Fit all` または `Home`: 全体表示
- 打点・miss・extra・roll／dynamic区間をクリック: 選択して統計パネルに詳細表示
- `Prev issue` / `Next issue`: miss／extraへ移動
- `Overlay` / `Target` / `Actual`: 表示モード切替

## Web側のコマンド

```bash
npm run format:check  # Prettier差分確認
npm run lint          # ESLint
npm run typecheck     # TypeScript strict typecheck
npm test              # Vitest unit/golden tests
npm run build         # Vite production build
npm run check         # 上記をまとめて実行
```

コードを整形する場合は `npm run format` を使います。

## Python onset PoC

WAVからTypeScriptと共有する `DetectedStroke[]` JSONを生成し、ground truthとの評価、parameter sweep、失敗例の可視化を行う独立パッケージです。

```bash
cd research/onset-poc
poetry install
poetry run onset-poc --help
poetry run ruff check .
poetry run ruff format --check .
poetry run mypy src
poetry run pytest
```

synthetic fixtureで4つのCLIを実行する例です。出力先は任意に変更できます。

```bash
mkdir -p work/phase4

poetry run onset-poc detect \
  ../../fixtures/audio/phase4-synthetic.wav \
  --config configs/practice-pad-baseline.json \
  --output work/phase4/detected.json \
  --plot work/phase4/detect.png

poetry run onset-poc evaluate \
  work/phase4/detected.json \
  ../../fixtures/audio/phase4-synthetic-truth.json \
  --output work/phase4/metrics.json

poetry run onset-poc sweep \
  ../../fixtures/audio/phase4-synthetic-dataset.json \
  configs/synthetic-grid.json \
  --config configs/practice-pad-baseline.json \
  --output work/phase4/comparison.csv \
  --report work/phase4/report.md

poetry run onset-poc visualize \
  ../../fixtures/audio/phase4-synthetic.wav \
  ../../fixtures/audio/phase4-synthetic-truth.json \
  --config configs/practice-pad-baseline.json \
  --output work/phase4/diagnostic.png
```

`detect` のJSONはwrapperを付けない `DetectedStroke[]` そのもので、Web側へそのまま渡せます。ground truthとdataset manifestの形式は [`docs/fixtures.md`](docs/fixtures.md) を参照してください。

## 現在の実装範囲

- 正規化・比較・四則演算を行うsafe-integer `Fraction`
- `ScoreDocument` のJSON validationとFraction正規化
- tempo changeを積分するbeat/time変換とScore Compiler
- measured rollの正解打点展開、unmeasured rollの区間保持
- deterministicな人工 `DetectedStroke[]` generator
- 開始offset粗探索、miss/extraを許すDP Matcher、robust affine refinement
- unmeasured roll内の検出打点の排他的割当
- click timing、actual tempo、internal rhythmの評価
- Dynamics、accent、measured/unmeasured roll、dynamic regionの型・I/O・基礎統計
- 高DPI対応Canvas timelineとbeat/subdivision grid
- target／actual打点、timing対応線、early／late、miss／extraの非色依存表示
- measured/unmeasured roll、crescendo/decrescendo区間表示
- zoom、scroll、fit、打点・区間selection、miss／extraナビゲーション
- timing、actual tempo、internal rhythm、dynamics、accent、rollの統計・selection inspector
- 表示範囲cullingを検証する4,000打fixture
- WAV読込と時間領域baseline onset detector
- adaptive local noise floor、candidate peak、backward attack refinement
- attack strength／stroke energy、relative dB、confidence／quality flag
- ground truth matchingとprecision／recall／F1／FP/min／timing error
- `detect`／`evaluate`／`sweep`／`visualize` CLI
- 条件ラベル別sweep CSV、diagnostic waveform plot、synthetic実験report
- `getUserMedia` と実適用設定の記録
- AudioWorkletによる固定長・mono Float32 PCM収集
- 録音停止時のWorklet、AudioNode、MediaStream track、AudioContext解放
- Python Phase 4と共有する時間領域onset detectorのpure TypeScript実装
- transferable PCMを受け取るoffline Web Worker detector
- 録音のpeak、RMS、clipping ratioとAGC等のquality warning
- 録音→検出→Matcher→Evaluator→Timelineの統合
- downsample済みmin/max waveform overviewと表示切替
- fake PCM統合testとPython共有WAV golden test
- 共有JSON fixture、unit test、golden test、GitHub Actions CI

主要設定は `apps/web/src/config/default-analysis-config.ts` に集約しています。未校正の閾値やペナルティは製品上の合否基準ではありません。

## 今回実装していないもの

- 実録500打以上のground truth datasetとparameter calibration
- spectral fluxを併用する検出器、practice-pad／snare製品presetの確定
- 譜面エディタ、メトロノーム
- IndexedDB保存
- 実マイクを使う自動E2E、長時間録音の性能計測、SharedArrayBuffer／WASM最適化
- スピーカーからのクリック混入の自動判定・除去
- 校正済みDynamics/accent/roll判定、100点換算

次のPhase 6では、Fractionを破壊しないgrid入力、stroke／accent／hand／region編集、undo／redo、JSON import／exportを持つScore Editorを実装します。

## ディレクトリ

```text
apps/web/src/domain/       ブラウザAPI非依存の共有型
apps/web/src/score/        validation、Fraction、tempo map、compiler
apps/web/src/matching/     DP alignment
apps/web/src/evaluation/   純粋評価ロジック
apps/web/src/audio/        Browser Audio、PCM連結、metadata、quality判定
apps/web/src/dsp/          pure TypeScript onset detectorとWorker client
apps/web/src/workers/      offline detector Worker entrypoint／protocol
apps/web/public/           standalone AudioWorklet processor
apps/web/src/session/      録音からmatching／evaluationまでのuse-case
apps/web/src/fixtures/     人工演奏generator
apps/web/src/ui/timeline/  viewport、scene、Canvas描画、操作
apps/web/src/ui/session/   統計・selection inspector
fixtures/                  TypeScript/Python共有JSON
research/onset-poc/        Phase 4 Python reference detectorと研究CLI
docs/adr/                  仕様との差異・設計判断
```

詳細仕様は [`docs/rhythm-grading-spec-v0.1.md`](docs/rhythm-grading-spec-v0.1.md)、依存方向は [`docs/architecture.md`](docs/architecture.md)、fixture規約は [`docs/fixtures.md`](docs/fixtures.md) を参照してください。
