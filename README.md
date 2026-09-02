# rhythm-grading

打楽器の譜面を正解イベント列へ変換し、検出済み打点列との対応付け・基礎評価を行うためのアプリケーションです。現在は仕様書 v0.1 の **Phase 0〜2** を実装しています。

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

開発サーバーが表示するURLをChromeまたはEdgeで開いてください。共有JSON fixtureを読み、validation済みの `TargetPerformance` を表示する最小画面が起動します。

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

## Python onset PoC骨格

Phase 4でオンセット検出を実装するための独立パッケージです。現時点では、TypeScriptと共有する `DetectedStroke` JSON境界のモデルとテストだけを置いています。

```bash
cd research/onset-poc
poetry install
poetry run ruff check .
poetry run mypy src
poetry run pytest
```

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
- 共有JSON fixture、unit test、golden test、GitHub Actions CI

主要設定は `apps/web/src/config/default-analysis-config.ts` に集約しています。未校正の閾値やペナルティは製品上の合否基準ではありません。

## 今回実装していないもの

- 実マイク入力、AudioWorklet、PCM collector
- 本格的なオンセット検出とPython研究CLI
- Web Worker/WASM
- Canvas timeline、譜面エディタ、メトロノーム
- IndexedDB保存
- E2Eと実録WAV fixture
- 校正済みDynamics/accent/roll判定、100点換算

次のPhase 3では、現在の純粋な `TargetPerformance + DetectedStroke[] -> StrokeAlignment -> PerformanceEvaluation` 境界をそのまま利用し、共有fixtureを表示するCanvas timelineから着手します。

## ディレクトリ

```text
apps/web/src/domain/       ブラウザAPI非依存の共有型
apps/web/src/score/        validation、Fraction、tempo map、compiler
apps/web/src/matching/     DP alignment
apps/web/src/evaluation/   純粋評価ロジック
apps/web/src/fixtures/     人工演奏generator
fixtures/                  TypeScript/Python共有JSON
research/onset-poc/        Phase 4向けPythonパッケージ骨格
docs/adr/                  仕様との差異・設計判断
```

詳細仕様は [`docs/rhythm-grading-spec-v0.1.md`](docs/rhythm-grading-spec-v0.1.md)、依存方向は [`docs/architecture.md`](docs/architecture.md)、fixture規約は [`docs/fixtures.md`](docs/fixtures.md) を参照してください。
