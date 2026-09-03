# rhythm-grading

打楽器の譜面を正解イベント列へ変換し、検出済み打点列との対応付け・評価・可視化を行うためのアプリケーションです。現在は仕様書 v0.1 の **Phase 0〜4** を実装しています。

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

開発サーバーが表示するURLをChromeまたはEdgeで開いてください。Golden exerciseと4,000打のdense fixtureを切り替え、タイムラインを操作できます。

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
- 共有JSON fixture、unit test、golden test、GitHub Actions CI

主要設定は `apps/web/src/config/default-analysis-config.ts` に集約しています。未校正の閾値やペナルティは製品上の合否基準ではありません。

## 今回実装していないもの

- 実マイク入力、AudioWorklet、PCM collector
- 実録500打以上のground truth datasetとparameter calibration
- spectral fluxを併用する検出器、practice-pad／snare製品presetの確定
- Web Worker/WASM
- Web Canvasの波形表示（Browser PCM入力と合わせてPhase 5で接続）
- 譜面エディタ、メトロノーム
- IndexedDB保存
- E2Eと実録WAV fixture
- 校正済みDynamics/accent/roll判定、100点換算

次のPhase 5では、Browser AudioからFloat32 PCMを収集し、Python referenceと同じ設定・I/Oを持つoffline Worker detectorへ接続します。

## ディレクトリ

```text
apps/web/src/domain/       ブラウザAPI非依存の共有型
apps/web/src/score/        validation、Fraction、tempo map、compiler
apps/web/src/matching/     DP alignment
apps/web/src/evaluation/   純粋評価ロジック
apps/web/src/fixtures/     人工演奏generator
apps/web/src/ui/timeline/  viewport、scene、Canvas描画、操作
apps/web/src/ui/session/   統計・selection inspector
fixtures/                  TypeScript/Python共有JSON
research/onset-poc/        Phase 4 Python reference detectorと研究CLI
docs/adr/                  仕様との差異・設計判断
```

詳細仕様は [`docs/rhythm-grading-spec-v0.1.md`](docs/rhythm-grading-spec-v0.1.md)、依存方向は [`docs/architecture.md`](docs/architecture.md)、fixture規約は [`docs/fixtures.md`](docs/fixtures.md) を参照してください。
