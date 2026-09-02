# リズム練習・採点アプリケーション仕様書

- 文書バージョン: 0.1.0
- ステータス: 初期実装用ベースライン
- 想定読者: 本プロジェクトを実装・検証するコーディングエージェント、人間の開発者
- 対象: Browser-first の打楽器練習・録音・採点アプリケーション、およびアタック検出研究用PoC

## 0. この文書の扱い

本書は、初期実装における要件、責務分割、データモデル、アルゴリズム、検証方法、完成条件を定める。

実装時は次を守ること。

1. 本書に明記されたモジュール境界と外部I/Oを優先する。
2. 閾値、窓幅、ペナルティなど実データで調整すべき値は、コードへ散在させず設定オブジェクトに集約する。
3. 根拠のない100点換算を製品仕様として固定しない。初期版はms、dB、miss数などの物理量・統計量を主表示とする。
4. 音声解析の完成を待たず、人工 `DetectedStroke[]` を用いて譜面、照合、評価、結果表示を実装・テストできる構造にする。
5. 各マイルストーンの受け入れ条件を満たしてから次へ進む。ロードマップ全体を一度に実装しない。
6. 本書と実装の間に意図的な差異を設ける場合は、理由をADRまたはREADMEへ記録する。

## 1. プロダクト概要

### 1.1 目的

打楽器奏者が、入力した練習譜面に合わせて演奏を録音し、次を客観的に確認できるアプリケーションを作る。

- 正解打点に対して各打音が早いか遅いか
- 演奏テンポが目標BPMからどの程度ずれたか
- テンポ傾向を除いた各打点間隔の乱れ
- miss、extra、二重検出の疑い
- 打音ごとの相対的な強さ
- アクセントが周囲の通常打から十分に分離しているか
- クレシェンド／デクレシェンドの形状
- ロールの密度、粒の均一性、空白、音量の均一性

結果は、正解譜面と実演打点を共通時間軸上に重ねる、音楽ゲーム／カラオケ型のタイムラインで可視化する。

### 1.2 中心設計

本システムは、以下の2経路を独立に構築し、イベント列で合流させる。

```text
ScoreDocument -> ScoreCompiler -> TargetPerformance

Audio PCM -> OnsetDetector -> DetectedStroke[]

TargetPerformance + DetectedStroke[]
    -> Matcher
    -> Evaluator
    -> EvaluationResult
    -> Timeline Viewer
```

音声入力方式、オンセット検出方式、譜面入力UIを変更しても、他の経路へ影響を広げないことを最優先とする。

### 1.3 想定利用フロー

1. ユーザーがBPM、拍子、小節数を設定する。
2. 時間軸型エディタで通常打、休符、アクセント、ロール、クレシェンド、デクレシェンドを入力する。
3. クリックを聴きながら練習台またはスネアを叩く。
4. アプリがマイクからモノラルPCMを録音する。
5. 録音停止後、オフラインでアタックを検出する。
6. 理想イベント列と実演イベント列を照合する。
7. タイムラインと統計値を表示する。
8. セッションを端末内に保存し、あとから再確認できるようにする。

## 2. スコープ

### 2.1 MVPに含めるもの

- デスクトップ版Chrome系ブラウザを第一対象とするWebアプリ
- 単一テンポおよびテンポ変更を表現できる譜面モデル
- 拍子、小節、任意分割グリッド
- 4、8、12、16、24、32分相当を含む通常打・休符の入力
- 通常打へのアクセント指定
- measured roll と unmeasured roll のデータ表現
- crescendo／decrescendo区間
- 手指定 `R`／`L`／未指定
- JSONによる譜面の入出力
- 人工演奏データによるMatcher、Evaluator、Timeline Viewer
- マイク録音からのFloat32 PCM取得
- 録音停止後のアタック検出
- miss／extraを許容するDP系列アラインメント
- timing、tempo、internal rhythm、dynamics、accent、rollの基礎評価
- IndexedDBによる端末内保存
- 解析設定とブラウザが実際に適用した音声設定の記録

### 2.2 MVPでは対象外

- 五線譜としての完全な記譜・印刷
- MusicXMLの完全対応
- buzz rollのバウンド単位評価
- 複数楽器・複数奏者の音源分離
- 右手・左手の音響からの自動推定
- 絶対音圧レベルの測定
- 演奏中のリアルタイム採点
- クラウドアカウント、サーバー同期、共有
- モバイルSafariを含む全ブラウザ同等保証
- スピーカー再生したクリックの高精度除去
- nativeアプリ固有の音声入力
- 学習済みニューラルネットを必須とする検出器
- 根拠の確立していない公式な100点換算

### 2.3 初期運用上の制約

- 高精度採点時はヘッドホンまたはイヤホンでクリックを再生する。
- ブラウザがAGC、ノイズ抑制、エコーキャンセルの無効化要求を受け入れない場合、Dynamics評価の信頼度を下げ、警告を表示する。
- クリッピング率が閾値を超えた録音ではDynamics評価を参考値とする。
- 開始オフセットと音声出力遅延があるため、MVPの主指標は最適開始offsetを除去した値とする。

## 3. 用語

| 用語 | 定義 |
|---|---|
| beat | 4分音符を1とする譜面上の時間単位 |
| target stroke | 譜面から生成された、時刻を持つ採点対象の1打 |
| target region | rollやcrescendoなど、開始・終了を持つ採点対象区間 |
| detected stroke | 録音から検出された1打。時刻、強度、信頼度を持つ |
| attack time | 打音候補の最大振幅時刻ではなく、最初の有意な立ち上がり時刻 |
| attack strength | attack直後の短い窓で測る打撃初期の強さ |
| stroke energy | attack後のより長い窓で測る打音全体の強さ |
| match | target strokeとdetected strokeの対応 |
| miss | target strokeに対応する実演打点がない状態 |
| extra | どのtarget strokeにも対応しない実演打点 |
| click timing error | 開始offsetのみを除去した、目標時間軸に対する誤差 |
| internal rhythm error | 演奏全体のoffsetと線形テンポ傾向を除去した残差 |
| measured roll | 32分など明示された打点列として採点するロール |
| unmeasured roll | 個々の正解時刻を定めず、区間内の密度・均一性で採点するロール |

## 4. 技術構成

### 4.1 推奨スタック

- Web: React + TypeScript + Vite
- 状態管理: React標準機能を基本とし、複雑化した場合のみ軽量ストアを追加
- 描画: Canvas 2D
- 音声取得: `getUserMedia` + Web Audio API + AudioWorklet
- 重いオフライン処理: Web Worker
- 保存: IndexedDB
- Webテスト: Vitest、Testing Library、Playwright
- DSP研究PoC: Python 3.12以上、NumPy、SciPy、librosa、soundfile、matplotlib、pytest
- Python依存管理: Poetry
- Webパッケージ管理: npm。別の既存方針がリポジトリにある場合はそれを優先

### 4.2 バックエンド

MVPではバックエンドを持たない。譜面、録音、解析結果は端末内に保存する。将来の同期機能を妨げないよう、Repository interfaceを介して永続化する。

### 4.3 推奨ディレクトリ

```text
/
  README.md
  docs/
    architecture.md
    adr/
    fixtures.md
  apps/
    web/
      src/
        domain/
        score/
        audio/
        dsp/
        matching/
        evaluation/
        storage/
        ui/editor/
        ui/timeline/
        ui/session/
        workers/
        worklets/
  research/
    onset-poc/
      pyproject.toml
      src/
      tests/
      notebooks/
      configs/
  fixtures/
    scores/
    performances/
    audio/
    expected/
```

共有fixtureのJSON仕様はTypeScriptとPythonの両方で解釈できるようにする。

## 5. 全体アーキテクチャと責務

### 5.1 Domain

UI、Web Audio、保存方式から独立した純粋データ型を置く。domainはブラウザAPIをimportしてはならない。

主要型:

- `ScoreDocument`
- `TargetPerformance`
- `TargetStroke`
- `TargetRegion`
- `DetectedStroke`
- `StrokeAlignment`
- `EvaluationResult`
- `AnalysisConfig`

### 5.2 Score

- JSON譜面のvalidation
- 有理数計算
- tempo mapからbeatと秒の相互変換
- エディタ用表現からtarget stroke／regionへのコンパイル
- 重複、範囲外、矛盾するregionの検査

### 5.3 Audio

- マイク権限取得
- AudioWorkletによるPCM収集
- 実sample rate、channel count、AGC等の設定記録
- 録音開始・停止
- クリッピング等の収録品質検査
- WAV書き出し（デバッグ・エクスポート用途）

### 5.4 DSP

- 前処理
- onset candidate生成
- sample-level attack refinement
- attack strength／stroke energy推定
- confidence算出
- `DetectedStroke[]` の生成

### 5.5 Matching

- 開始offsetの粗推定
- targetとdetectedのDP alignment
- miss／extraの同定
- 必要に応じたoffset／tempo傾向のrobust再推定
- unmeasured roll区間への実演打点の割当

### 5.6 Evaluation

- click timing
- actual tempo
- internal rhythm
- dynamics
- accent
- roll
- 品質警告
- 統計量の集約

### 5.7 UI

- 譜面編集
- 録音操作
- 結果タイムライン
- 波形表示
- 統計値・警告表示
- セッション履歴

### 5.8 Storage

- scoreとsessionの保存、取得、削除
- schema version管理
- 将来のmigration
- 音声を保存しない設定への対応

## 6. 譜面データモデル

### 6.1 有理数

beat位置・beat長は浮動小数点では保存せず、有理数で保存する。

```ts
export interface Fraction {
  numerator: number;
  denominator: number;
}
```

不変条件:

- numerator、denominatorはsafe integer
- denominatorは正
- `gcd(abs(numerator), denominator) = 1`
- 0は `{ numerator: 0, denominator: 1 }`
- JSON読込時に必ず正規化する

4分音符を1 beatとするため、n分音符相当の長さは `4 / n` beatである。

| 分割 | beat長 |
|---:|---:|
| 4分 | 1 |
| 8分 | 1/2 |
| 12分 | 1/3 |
| 16分 | 1/4 |
| 24分 | 1/6 |
| 32分 | 1/8 |

「12分音符」「24分音符」はUI上のグリッド名であり、保存の本質はbeat位置の有理数である。将来の5連符、7連符、20分相当も同じモデルで表現する。

### 6.2 ScoreDocument

```ts
export type Hand = "R" | "L" | "unspecified";

export interface ScoreDocument {
  schemaVersion: "1.0";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lengthBeats: Fraction;
  initialTempoBpm: number;
  tempoChanges: TempoChange[];
  timeSignatures: TimeSignatureChange[];
  strokes: ScoreStroke[];
  regions: ScoreRegion[];
  editor?: EditorMetadata;
}

export interface TempoChange {
  beat: Fraction;
  bpm: number;
}

export interface TimeSignatureChange {
  beat: Fraction;
  numerator: number;
  denominator: 1 | 2 | 4 | 8 | 16;
}

export interface ScoreStroke {
  id: string;
  beat: Fraction;
  hand: Hand;
  accent: boolean;
  targetDynamic?: number;
  tags?: string[];
}

export type ScoreRegion = RollRegion | DynamicRegion;

export interface BaseRegion {
  id: string;
  startBeat: Fraction;
  endBeat: Fraction;
}

export interface RollRegion extends BaseRegion {
  type: "roll";
  mode: "measured" | "unmeasured";
  subdivision?: Fraction;
  targetDensityHz?: number;
}

export interface DynamicRegion extends BaseRegion {
  type: "crescendo" | "decrescendo";
  curve: "linear" | "ease-in" | "ease-out";
  startLevel?: number;
  endLevel?: number;
}

export interface EditorMetadata {
  gridDivision?: number;
  snapEnabled?: boolean;
  viewportStartBeat?: Fraction;
  viewportEndBeat?: Fraction;
}
```

### 6.3 値の制約

- `initialTempoBpm > 0`
- tempo changeのbeatは `[0, lengthBeats)`
- 同一beatに複数tempo changeを置かない
- `endBeat > startBeat`
- regionは `[0, lengthBeats]` 内
- stroke id、region idは文書内で一意
- 同一beatの複数strokeは将来のflam等に備えてデータ上は許可する。ただしMVPエディタでは警告し、通常は1件に制限する
- `targetDynamic`、`startLevel`、`endLevel` は0から1の正規化値
- measured rollは `subdivision` を必須とする
- unmeasured rollでは `subdivision` を正解打点生成には使わない
- crescendoとdecrescendoは他のstroke・rollと重ねられる
- 同一区間で方向の異なるdynamic regionが重複する場合はvalidation error

### 6.4 JSON例

```json
{
  "schemaVersion": "1.0",
  "id": "exercise-12th-accent-cresc",
  "title": "12分アクセントとクレシェンド",
  "createdAt": "2026-09-02T00:00:00.000Z",
  "updatedAt": "2026-09-02T00:00:00.000Z",
  "lengthBeats": { "numerator": 8, "denominator": 1 },
  "initialTempoBpm": 120,
  "tempoChanges": [],
  "timeSignatures": [
    {
      "beat": { "numerator": 0, "denominator": 1 },
      "numerator": 4,
      "denominator": 4
    }
  ],
  "strokes": [
    {
      "id": "s0",
      "beat": { "numerator": 0, "denominator": 1 },
      "hand": "R",
      "accent": true
    },
    {
      "id": "s1",
      "beat": { "numerator": 1, "denominator": 3 },
      "hand": "L",
      "accent": false
    },
    {
      "id": "s2",
      "beat": { "numerator": 2, "denominator": 3 },
      "hand": "R",
      "accent": false
    }
  ],
  "regions": [
    {
      "id": "dyn0",
      "type": "crescendo",
      "startBeat": { "numerator": 4, "denominator": 1 },
      "endBeat": { "numerator": 8, "denominator": 1 },
      "curve": "linear",
      "startLevel": 0.2,
      "endLevel": 0.9
    }
  ]
}
```

### 6.5 休符

休符は明示イベントとして保存しない。strokeが存在しない時間帯が休符である。エディタは休符表示を導出する。将来MusicXML等との相互変換で必要になった場合のみ表示用メタデータを追加する。

## 7. Score Compiler

### 7.1 入力と出力

```ts
export interface ScoreCompiler {
  compile(score: ScoreDocument): TargetPerformance;
}

export interface TargetPerformance {
  scoreId: string;
  durationSec: number;
  strokes: TargetStroke[];
  regions: TargetRegion[];
  tempoMap: CompiledTempoSegment[];
}

export interface TargetStroke {
  id: string;
  sourceStrokeId?: string;
  sourceRegionId?: string;
  beat: Fraction;
  timeSec: number;
  hand: Hand;
  accent: boolean;
  targetDynamic?: number;
  origin: "stroke" | "measured-roll";
}

export type TargetRegion = TargetRollRegion | TargetDynamicRegion;
```

### 7.2 beatから秒への変換

tempo一定区間では、beat差 `d` に対して

```text
seconds = d * 60 / bpm
```

tempo changeを跨ぐ場合は区間ごとに積分する。変換は決定的であり、同じ入力から常に同じ出力を得ること。

### 7.3 measured roll

measured rollは `startBeat` 以上 `endBeat` 未満の範囲へ、`subdivision` 間隔で `TargetStroke` を生成する。終端に通常strokeがある場合の重複はidとbeatで検出し、既存strokeを優先して重複生成しない。

### 7.4 unmeasured roll

unmeasured rollは個々の `TargetStroke` へ展開しない。時間区間、任意のtarget density、dynamic envelope参照を持つ `TargetRollRegion` を生成する。

### 7.5 compilerの決定性

- 出力はtimeSec、次にidで安定sortする
- JSON配列の入力順に結果が依存しない
- 同値Fractionは同じbeatとして扱う
- 丸めは表示時のみ行い、内部の秒はnumberで可能な限り精度を保つ

## 8. 実演データモデル

```ts
export interface DetectedStroke {
  id: string;
  sampleIndex: number;
  timeSec: number;
  attackStrengthDbfs: number;
  strokeEnergyDbfs: number;
  relativeAttackDb: number;
  relativeEnergyDb: number;
  confidence: number;
  flags: DetectedStrokeFlag[];
}

export type DetectedStrokeFlag =
  | "near-clipping"
  | "weak-signal"
  | "possible-double-trigger"
  | "near-recording-boundary";

export interface RecordingMetadata {
  schemaVersion: "1.0";
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  durationSec: number;
  requestedConstraints: AudioConstraintSnapshot;
  appliedSettings: AudioSettingSnapshot;
  clippingSampleRatio: number;
  peakAbs: number;
  rmsDbfs: number;
  startedAt: string;
}
```

不変条件:

- `sampleIndex` はattack sampleの0-based index
- `timeSec = sampleIndex / sampleRate`
- strokeはsampleIndex昇順
- confidenceは0から1
- dBFSは0以下を原則とする
- relative値はセッション内基準からの差

### 8.1 セッション内相対dB

信頼度が十分高く、クリッピングしていないstrokeの代表値のmedianを基準とする。

```text
relativeAttackDb_i = attackStrengthDbfs_i - median(attackStrengthDbfs)
relativeEnergyDb_i = strokeEnergyDbfs_i - median(strokeEnergyDbfs)
```

対象が少なすぎる場合はrelative値をnull相当として扱い、Dynamics評価を行わない。TypeScript型では必要に応じてnullableへ変更してよいが、欠測を0として扱ってはならない。

## 9. Browser Audio

### 9.1 取得要求

概念上、次のconstraintを要求する。

```ts
{
  audio: {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  }
}
```

sample rateは48 kHzを希望してよいが、実際の `AudioContext.sampleRate` を正として記録する。要求値を実値とみなしてはならない。

### 9.2 PCM経路

- 解析の中心にMediaRecorderの圧縮音声を置かない
- `getUserMedia -> MediaStreamAudioSourceNode -> AudioWorkletNode -> Float32 PCM`
- AudioWorklet内で重い解析を行わない
- Workletは固定長chunkをpostMessageし、メインスレッドまたは専用collectorが連結する
- 解析は録音停止後、Web Workerへ渡して行う
- 長時間録音時のコピー増大を避けるため、transferableまたはSharedArrayBufferの採否を実測して決める

### 9.3 録音状態

```text
idle -> requesting-permission -> ready -> recording -> processing -> completed
                                     \-> error
```

二重開始、録音中のデバイス切替、録音中の画面遷移を安全に扱う。少なくとも録音破損やWorkletの残存を起こさない。

### 9.4 収録品質警告

以下を判定してEvaluationResultへ渡す。

- `appliedSettings.autoGainControl !== false`
- `appliedSettings.noiseSuppression !== false`
- `appliedSettings.echoCancellation !== false`
- clipping sample ratioが設定閾値以上
- 入力RMSが低すぎる
- 検出strokeの大半がlow confidence
- クリックをスピーカー再生している可能性

## 10. オンセット検出

### 10.1 基本方針

最大振幅時刻をattack timeとしてはならない。候補を検出したあと元波形を後ろ向きに探索し、最初の有意な立ち上がりへrefineする。

```text
raw PCM
  -> DC除去／必要に応じたband-pass
  -> 絶対値または短時間energy
  -> 1〜2 ms程度の平滑化
  -> adaptive local noise floor
  -> onset detection function
  -> candidate peak
  -> backward refinement
  -> refractory／重複整理
  -> strength推定
  -> DetectedStroke[]
```

### 10.2 初期アルゴリズム

最初の実装は時間領域を主とする。必要に応じてHFCまたはspectral fluxを追加できる構造にする。

例:

```text
ODF = wEnergy * normalizedEnergyRise
    + wFlux   * normalizedSpectralFlux
```

初期設定では `wFlux = 0` を許容する。

### 10.3 設定モデル

```ts
export interface OnsetDetectorConfig {
  highPassHz: number | null;
  envelopeWindowMs: number;
  noiseFloorWindowMs: number;
  thresholdOffsetDb: number;
  thresholdMadMultiplier: number;
  candidateMinDistanceMs: number;
  refinementLookbackMs: number;
  refinementRiseFraction: number;
  attackWindowMs: number;
  energyWindowMs: number;
  useSpectralFlux: boolean;
  spectralFluxWeight: number;
  confidenceThreshold: number;
}
```

数値の初期値はfixtureと実録データで妥当性を示し、設定ファイルに置く。上記名称・単位はWebとPython PoCで揃える。

### 10.4 candidate検出

- 局所noise floorはmedianまたはrobust統計で推定する
- 閾値は固定絶対振幅だけに依存させない
- 閾値を超えた区間ごとにcandidateを1つ生成する
- candidate時刻はODF peakでよいが、最終attack時刻には使わない
- 高速doubleを潰さないよう、最小距離は実験で調整する

### 10.5 backward refinement

candidateから `refinementLookbackMs` だけ遡り、次のいずれかの明確な規則でattack sampleを決める。

- local baseline + robust thresholdを最初に継続して超えるsample
- candidate peakに対する一定割合を最初に超えるsample
- 包絡線の最大傾斜区間から求めた立ち上がり開始点

採用方式はinterfaceの外へ漏らさず、Python実験で比較可能にする。refinement前後のsample indexをデバッグ出力へ残せること。

### 10.6 強度指標

- Attack strength: attackから約8 msのRMSをdBFS化
- Stroke energy: attackから約30 msのRMSをdBFS化

窓幅はconfigで変更可能とする。窓が次のstrokeと重なる高速演奏では、次attack直前で切る方式も実験候補とする。単純な最大振幅だけを主指標にしない。

### 10.7 confidence

confidenceは少なくとも以下から決める。

- noise floorに対する立ち上がり量
- ODF peakの明瞭さ
- refinement位置の安定性
- clippingの有無
- 録音境界への近さ

初期版は規則ベースでよい。算出式と校正前であることをコードコメントおよびUI上の説明に残す。

### 10.8 難ケース

| ケース | 初期対応 |
|---|---|
| 弱いpp | low confidenceを許容し、false positiveとのtrade-offを測る |
| ff | clipping警告。Dynamicsは参考値 |
| 高速double | 前打音の減衰中でもenergy riseを検出できるか専用fixtureで評価 |
| flam | データモデル上は2打を許容。MVPエディタでは高度機能扱い |
| buzz roll | MVP対象外。1ストロークか複数バウンドかを通常onsetで決めない |
| スネア | snappyの二次過渡をextraにしないためrefractoryと形状を検証 |
| 練習台 | スネアと別presetを持てる構造にする |
| 内蔵マイク | 適用されたAGC等を記録し、Dynamics信頼度を調整 |
| クリック混入 | MVPではヘッドホンを要求。将来の既知信号除去は別モジュール |

## 11. Event Matcher

### 11.1 目的

番号順の単純対応は禁止する。1発のmissまたはextraの後も対応関係を復元できるよう、sequence alignmentを用いる。

### 11.2 入力と出力

```ts
export interface MatcherConfig {
  timingSigmaMs: number;
  maxMatchDistanceMs: number;
  missPenalty: number;
  extraPenalty: number;
  confidencePenaltyWeight: number;
  useAmplitudeInMatching: false;
  offsetSearchRangeMs: number;
  affineRefinementEnabled: boolean;
}

export interface StrokeAlignment {
  matches: StrokeMatch[];
  misses: MissedStroke[];
  extras: ExtraStroke[];
  estimatedOffsetSec: number;
  estimatedTimeScale: number;
  totalCost: number;
}

export interface StrokeMatch {
  targetStrokeId: string;
  detectedStrokeId: string;
  targetTimeSec: number;
  detectedTimeSec: number;
  rawTimingErrorSec: number;
  offsetAdjustedErrorSec: number;
}
```

### 11.3 DP遷移

状態 `(i, j)` は先頭からtargetをi件、detectedをj件処理済みとする。

- match: `(i, j) -> (i+1, j+1)`
- miss: `(i, j) -> (i+1, j)`
- extra: `(i, j) -> (i, j+1)`

初期match costは時刻中心とし、音量は使わない。

```text
normalizedError = abs((detectedTime - offset) - targetTime) / timingSigma
matchCost = robustLoss(normalizedError)
          + confidencePenalty
```

`maxMatchDistanceMs` を超える組はmatch禁止または十分大きなcostとする。ただしlocal note intervalが短い場合は、その一定割合をgateへ使うなど、設定可能にする。

### 11.4 offset推定

録音開始と演奏開始は一致しない。次のような決定的な粗探索を実装する。

1. 先頭付近のtarget／detected時刻差からoffset候補を複数生成する。
2. 各候補でbanded DPを実行する。
3. 正規化total costが最小の候補を採用する。
4. match集合からrobust medianでoffsetを再推定する。
5. 必要なら再度DPを行う。

最初の1打同士が対応すると仮定してはならない。

### 11.5 affine refinement

十分なmatch数がある場合、robust回帰で

```text
detectedTime = a + b * targetTime + residual
```

を推定する。

- `a`: 開始offset
- `b`: 演奏時間軸の伸縮
- `targetBpm / b`: actual BPMの推定
- residual: internal rhythm error

ただし、クリック基準のmiss判定を隠さないため、DPの主要対応付けを無制限にaffine変形して正当化してはならない。許容time scale範囲をconfig化し、click timingとinternal rhythmを別指標として残す。

### 11.6 rollとの関係

- measured rollは通常のTargetStroke列としてDPへ入れる
- unmeasured roll内部のdetected strokeは通常DPから一度分離し、region evaluatorへ渡す
- region境界付近では固定marginを設け、隣接通常strokeとの二重帰属を避ける
- 1 detected strokeが通常strokeとroll regionの両方へ属してはならない

### 11.7 性能

短い練習セッションでは完全DPでもよい。数千打へ対応するため、時間gateに基づくbanded DPを実装可能な構造にする。最適性を変える最適化には回帰fixtureを用意する。

## 12. 評価仕様

### 12.1 基本原則

- match結果と評価を分離する
- 元の物理量・統計量を失わない
- 欠測、低信頼、クリッピングを0点または0誤差に変換しない
- 100点換算はcalibration後に追加できる派生表示とする
- 総合値だけでなく、改善行動につながる内訳を返す

### 12.2 click timing

target時刻を `t_i`、detected時刻を `x_i`、推定開始offsetを `a` とする。

```text
e_click_i = (x_i - a) - t_i
```

返す統計量:

- MAE
- median absolute error
- mean signed error
- standard deviation
- P95 absolute error
- early率、late率、within tolerance率
- beat／subdivision／hand／accent別の集計

early／lateの符号は全UI・JSONで統一する。本仕様では負をearly、正をlateとする。

### 12.3 actual tempo

affine回帰 `x_i = a + b t_i + r_i` により、tempo一定区間では

```text
actualBpm = targetBpm / b
```

を返す。テンポ変更譜面では全体単一BPMを無理に返さず、tempo segmentごとのtime scaleまたは全体time scaleを返す。

### 12.4 internal rhythm

```text
e_internal_i = x_i - (a + b * t_i)
```

返す統計量:

- residual MAE
- residual SD
- residual P95
- inter-onset interval error
- subdivision position別の系統誤差
- R／L指定がある場合の手別平均・SD

これにより「目標より遅いが等間隔」と「平均テンポは正しいが粒が不均一」を区別する。

### 12.5 dynamics

初期版では `relativeAttackDb` と `relativeEnergyDb` の両方を保存し、主表示指標を設定で切り替えられるようにする。

返す統計量:

- 全strokeのrelative dB SD
- 通常打のみのrelative dB SD
- targetDynamicがある場合の正規化curve誤差
- hand別平均・SD
- clipped／low confidence除外件数

絶対dBFSの大小だけで演奏技能を採点しない。

### 12.6 accent

各accent strokeについて、近傍の非accent matched strokeのrobust medianを基準にする。

```text
accentContrastDb_i
  = accentRelativeDb_i - median(nearbyNonAccentRelativeDb)
```

近傍はbeat距離または前後のstroke数でconfig化する。十分な通常打がない場合は評価不能とする。

返す値:

- accentごとのcontrast dB
- accent contrastのmedian、最小値
- 通常打のばらつき
- 「アクセント自体が弱い」のか「周辺通常打が大きすぎる」のかを判別できる基礎値

### 12.7 crescendo／decrescendo

dynamic region内のmatched strokeについて、開始を0、終了を1とする正規化時刻 `u_i` と相対dB `y_i` を作る。

評価項目:

- robust回帰傾きと期待方向
- Spearman順位相関
- 指定curveをsession内rangeへfitした残差
- 局所的な逆行量
- 始点と終点のdynamic差

絶対的な「各strokeの正解dB」を固定しない。startLevel／endLevelがある場合も、session内の利用可能rangeへ対応づける。

### 12.8 unmeasured roll

region内のdetected stroke時刻を `x_1 ... x_N` とし、IOIを `d_i = x_(i+1)-x_i` とする。

返す統計量:

- stroke count
- density: `N / duration`
- mean IOI
- IOI SD
- IOI CV: `SD(d) / mean(d)`
- P95 IOI
- maximum gap
- region開始から最初のstrokeまでのgap
- 最後のstrokeからregion終了までのgap
- relative dB SD
- crescendo等と重なる場合のdynamic trend

targetDensityHzが指定されている場合のみ、密度差を返す。指定されていないrollへ恣意的な理想密度を課さない。

### 12.9 miss／extra

- miss数と対象beat
- extra数と時刻
- 連続miss最大数
- possible double trigger flag付きextra数

onset検出のconfidenceが低い場合、「奏者のextra」と「検出器の疑い」をUIで区別する。

### 12.10 評価不能条件

各評価器は `status: "ok" | "insufficient-data" | "low-confidence" | "invalid"` を返し、理由codeを持つ。例:

- matched strokeが少なすぎる
- accent周囲に通常打がない
- 全strokeがclipped
- AGC有効でDynamicsの比較信頼度が低い
- roll内strokeが2件未満でIOIを計算できない

## 13. EvaluationResult

```ts
export interface EvaluationResult {
  schemaVersion: "1.0";
  scoreId: string;
  sessionId: string;
  analysisConfigVersion: string;
  recording: RecordingMetadata;
  alignment: StrokeAlignment;
  timing: TimingEvaluation;
  tempo: TempoEvaluation;
  internalRhythm: RhythmEvaluation;
  dynamics: DynamicsEvaluation;
  accents: AccentEvaluation;
  rolls: RollEvaluation[];
  dynamicRegions: DynamicRegionEvaluation[];
  quality: QualityAssessment;
  generatedAt: string;
}
```

全ての集約値から、該当するstroke／match／regionへ辿れるIDを保持する。UI都合の文字列だけを結果として保存しない。

## 14. Timeline Viewer

### 14.1 表示要件

共通時間軸に以下を重ねる。

1. 小節線・拍・subdivision grid
2. target stroke
3. accent、hand、target dynamic
4. roll／crescendo／decrescendo region
5. 波形
6. detected stroke
7. target-detected対応
8. miss／extra
9. timing errorの色・数値
10. 選択・再生cursor

### 14.2 Canvas layer

概念上、次のlayerに分ける。

```text
grid
regions
target
waveform
detected
matching
selection-and-cursor
```

実Canvas要素数は実装都合で統合してよいが、描画責務は分離する。

### 14.3 必須操作

- horizontal scroll
- zoom in／out
- 全体fit
- stroke選択
- 選択strokeの詳細表示
- miss／extraへの移動
- 波形表示のon／off
- targetのみ、actualのみ、重ね表示の切替

### 14.4 色

色だけに意味を依存させない。early／accurate／lateは色に加え、符号付きmsまたは形状でも識別できること。missとextraも異なる形状を持つ。

### 14.5 性能

数千strokeと波形overviewを60 fpsに近い操作感でscroll／zoomできることを目標とする。波形は表示解像度に合わせたmin/max pyramidまたはdownsample cacheを使う。

## 15. Score Editor

### 15.1 基本UI

五線譜ではなく、横軸をbeat／timeとする音楽ゲーム型エディタを採用する。

### 15.2 必須機能

- BPM、拍子、長さの設定
- grid division選択: 4、8、12、16、24、32分相当
- 任意n分割入力へ拡張可能な設計
- click／tapでstroke追加・削除
- 複数選択
- accent toggle
- handのR／L／unspecified指定
- roll regionの作成とmode指定
- crescendo／decrescendo regionの作成
- undo／redo
- JSON import／export
- validation error表示

### 15.3 保存と編集表現

grid divisionは入力支援であり、strokeそのものの種類ではない。gridを12分から16分へ変更しても既存beat位置を丸めたり破壊したりしない。

### 15.4 将来機能

- keyboard入力
- pattern copy／repeat
- rudiment template
- MIDI／MusicXML import
- velocity curve編集
- flam／dragの専用表現

## 16. Metronome

### 16.1 スケジューリング

クリックは `AudioContext.currentTime` を基準にlook-ahead schedulingする。`setInterval` の発火時刻そのものに音を鳴らす実装は禁止する。

### 16.2 レイテンシ

取得可能な場合、`baseLatency` と `outputLatency` をsession metadataへ保存する。ただしMVP採点はこれだけで絶対レイテンシを完全補正したとみなさない。

### 16.3 カウントイン

- 既定2小節、設定可能
- target timeの0は演奏開始beat
- 録音はカウントイン前から開始してよい
- matcherが録音開始offsetを吸収する

### 16.4 クリック混入

MVPの高精度モードではヘッドホンを要求する。スピーカー使用時は結果へ警告を付ける。既知クリック波形のキャンセルは将来機能とする。

## 17. Storage

### 17.1 Repository

```ts
export interface ScoreRepository {
  list(): Promise<ScoreSummary[]>;
  get(id: string): Promise<ScoreDocument | null>;
  put(score: ScoreDocument): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SessionRepository {
  listByScore(scoreId: string): Promise<SessionSummary[]>;
  get(id: string): Promise<PracticeSession | null>;
  put(session: PracticeSession): Promise<void>;
  delete(id: string): Promise<void>;
}
```

### 17.2 PracticeSession

少なくとも以下を持つ。

- session id
- score snapshotまたはscore version hash
- recording metadata
- raw PCMまたはWAVへの参照（保存設定がonの場合）
- detected strokes
- analysis config version
- evaluation result
- createdAt

譜面編集後も過去結果を再現できるよう、score idだけでなくsnapshotまたはcontent hashを保存する。

### 17.3 migration

IndexedDB database versionと各JSON schema versionを分ける。破壊的変更時はmigrationを実装し、読めないデータを黙って削除しない。

## 18. Pythonアタック検出PoC

### 18.1 目的

Webアプリ本体から独立して、WAVとground truthからアタック検出器の精度を定量評価し、Web実装へ移植するアルゴリズムとparameter presetを決める。

### 18.2 CLI

少なくとも次の操作を提供する。

```text
detect: WAV -> detected_strokes.json + diagnostic plot
evaluate: detected + ground truth -> metrics.json
sweep: dataset + config grid -> comparison.csv
visualize: waveform + envelope + candidates + refined attacks + truth
```

### 18.3 ground truth取得

推奨実験:

- CH1: 通常マイク
- CH2: 練習台またはスネアへ付けたピエゾ／ドラムトリガー
- 同一オーディオインターフェースで同時録音
- CH2を一定thresholdとrefractoryでtruth event化
- マイクとピエゾの定常offsetはrobust medianで除去

データセットには最低限以下の軸を含める。

- 弱・中・強
- 60、120、180 BPM
- single stroke
- double stroke
- accent pattern
- 練習台
- スネア
- 複数のマイク距離・向き

目安として合計500打以上を初回評価単位とする。

### 18.4 検出評価

truthとpredictionもmiss／extraを許すmatchingで対応させる。許容窓を明示する。

返す値:

- precision
- recall
- F1
- false positives per minute
- timing signed mean
- offset除去後のtiming MAE
- timing SD
- timing P95
- 強度・tempo・楽器別のstratified metrics

平均だけで合否を決めない。

### 18.5 暫定目標

以下は製品保証ではなく、方式選定の暫定gateとする。

- 練習台、中〜強打、single stroke: F1 0.99以上
- 上記条件の定常offset除去後: timing MAE 5 ms以下、P95 10 ms以下
- double stroke: F1 0.97以上
- 弱打、スネア、高速条件は別集計し、失敗条件を可視化

達成できない場合も、閾値を恣意的に緩めるのではなくerror analysisを残す。

### 18.6 PythonとWebの一致

選定したアルゴリズムについて、共有PCM fixtureに対し次を確認する。

- event count一致
- attack sampleは許容sample差以内
- dB指標は小さな数値誤差以内
- configの単位・意味一致

Pythonは研究用reference、TypeScriptは製品実装とし、両者の差異をfixtureで監視する。

## 19. テスト仕様

### 19.1 Domain／Score

- Fraction正規化、比較、加減算
- 任意分割のbeat位置
- tempo changeを跨ぐbeat-to-seconds
- measured roll展開
- unmeasured roll非展開
- 入力配列順に依存しないcompiler出力
- invalid region、重複id、範囲外のvalidation

### 19.2 Matcher

人工データで少なくとも次をテストする。

- 完全一致
- 全体offsetのみ
- 全体tempo driftのみ
- 1 miss
- 1 extra
- 連続miss
- 先頭extra
- 最初のtargetをmiss
- 同一付近の二重検出
- 高速12／24分
- measured roll
- unmeasured roll境界
- low confidence event

各fixtureについて期待するmatch pair、miss id、extra idを明記する。

### 19.3 Evaluator

- earlyが負、lateが正
- offset除去
- affine trend除去
- actual BPM計算
- hand別bias
- accent contrast
- monotonic crescendoと途中で逆行するcrescendo
- roll density、CV、max gap
- insufficient-dataの扱い
- clipped event除外

### 19.4 DSP

- 無音
- 単一impulse
- noise + impulse
- 近接2打
- 長いringing tail
- clipped impulse
- 録音先頭／末尾の打音
- 実録golden WAV

### 19.5 UI

- JSON譜面importからtimeline表示
- zoom／scroll後のhit test
- stroke追加・削除・undo／redo
- region resize
- miss／extraの表示
- keyboardとpointer双方の基本操作
- 色覚に依存しない表示

### 19.6 E2E

実マイクはCIで必須にしない。fake MediaStreamまたはfixture PCMを注入し、次を通す。

```text
譜面読込 -> 録音相当入力 -> 解析 -> matching -> 結果表示 -> session保存 -> 再読込
```

## 20. 非機能要件

### 20.1 再現性

- analysis configにversionを付ける
- score snapshot、detector version、matcher configをsessionに保存する
- 同じPCM、score、configから同じ結果を返す
- 時刻処理に現在時刻や描画fpsを混入させない

### 20.2 性能目標

- 48 kHz mono、5分録音を一般的なデスクトップ環境で録音終了後数秒以内に解析することを初期目標とする
- UI threadを長時間blockしない
- timelineのzoom／scrollで顕著なカクつきを生じさせない
- 保存容量と録音保存on／offをUIで確認できる

### 20.3 プライバシー

- MVPでは音声を外部送信しない
- マイク利用目的を権限要求前に説明する
- 録音保存をoffにできる
- セッション削除時、関連音声も削除する

### 20.4 エラー処理

- マイク権限拒否
- 対応AudioWorkletなし
- デバイス切断
- IndexedDB quota超過
- 壊れた譜面JSON
- 解析Workerの例外

いずれもユーザーが次に取る行動を示す。技術的なstack traceだけを画面へ出さない。

### 20.5 対応環境

- MVP正式対象: 最新安定版Chrome／Edgeのデスクトップ
- Firefox、Safari、Android、iOSはbest effortから開始
- 実ブラウザごとに `getSettings()` とレイテンシ情報の取得可否を記録する

## 21. 解析設定

全閾値を次のようなversion付き設定へ集約する。

```ts
export interface AnalysisConfig {
  version: string;
  onset: OnsetDetectorConfig;
  matcher: MatcherConfig;
  timing: TimingEvaluationConfig;
  dynamics: DynamicsEvaluationConfig;
  roll: RollEvaluationConfig;
  quality: QualityConfig;
}
```

要件:

- preset名を持てる: `practice-pad-default`、`snare-default` 等
- sessionに完全な設定snapshotまたは解決可能なversionを保存
- UIで変更しない内部設定も1か所から追跡可能
- tuning用configと製品defaultを区別

## 22. ロードマップと受け入れ条件

### Phase 0: Repository foundation

成果物:

- WebとPython PoCの骨格
- lint、format、unit test、CI
- domain依存規則
- 共有fixturesディレクトリ
- READMEにセットアップとコマンド

受け入れ条件:

- clean checkoutからREADMEの手順で起動・test可能
- CIがlint、typecheck、unit testを実行
- 空の画面だけでなく、fixtureを読んだ最小動作がある

### Phase 1: Score Model and Compiler

成果物:

- Fraction
- ScoreDocument validation
- tempo map
- ScoreCompiler
- JSON fixtures

受け入れ条件:

- 4／8／12／16／24／32分相当を正確にcompile
- tempo changeとmeasured／unmeasured rollのunit test
- サンプルJSONからTargetPerformanceを出力可能

### Phase 2: Synthetic Matcher and Evaluator

成果物:

- artificial performance generator
- offset search
- DP matcher
- timing／tempo／internal rhythm評価
- 基礎dynamics／accent／roll評価

受け入れ条件:

- miss／extraを入れたfixtureで、その後の対応がずれない
- 全体offset、tempo drift、局所誤差を分離
- 主要ケースのgolden JSON test

### Phase 3: Result Timeline Prototype

成果物:

- Canvas timeline
- target／actual／match／miss／extra表示
- zoom、scroll、selection
- 統計panel

受け入れ条件:

- 手書きscore JSONと人工DetectedStroke JSONだけで結果を閲覧可能
- 12／24分、roll、crescendoを表示可能
- 数千strokeのfixtureで操作可能

### Phase 4: Python Onset PoC

成果物:

- detect／evaluate／sweep／visualize CLI
- ground truth format
- baseline detector
- 実験report

受け入れ条件:

- WAVからDetectedStroke互換JSONを生成
- truthとのprecision／recall／F1／timing errorを出力
- 失敗例を波形上で確認可能

### Phase 5: Browser Audio Integration

成果物:

- getUserMedia
- AudioWorklet PCM collector
- offline Worker detector
- applied settings／quality metadata
- 録音から結果までの統合

受け入れ条件:

- デスクトップChromeで録音停止後に結果表示
- fake PCMを用いたE2E
- AGC等とclippingの警告
- Worklet／streamが停止後に解放される

### Phase 6: Score Editor

成果物:

- grid入力
- stroke、accent、hand、region編集
- undo／redo
- JSON import／export

受け入れ条件:

- 指定されたMVP要素をGUIだけで作成可能
- grid変更で既存Fractionを破壊しない
- 作成譜面を保存・再読込可能

### Phase 7: Calibration and Advanced Evaluation

成果物:

- ピエゾground truth dataset
- detector parameter選定
- dynamics／accent／roll評価の校正
- practice pad／snare preset

受け入れ条件:

- 条件別metricsとerror analysisを文書化
- WebとPythonの共有fixture一致
- 暫定目標を満たすか、満たさない条件が明確

### Phase 8: PWA and Optional Real-time UX

成果物:

- PWA install
- offline asset利用
- 必要なら演奏中の流れる譜面

受け入れ条件:

- offlineで既存譜面の練習が可能
- real-time表示が採点用PCMの欠落を起こさない

## 23. 初回実装スレッドへの指示

最初の実装ではPhase 0からPhase 2を対象とし、実マイク入力や本格DSPを同時に作らないこと。次の順で進める。

1. 既存repositoryと指示ファイルを調査する。
2. 既存構成がある場合は本仕様との対応表を作り、不要な全面改築を避ける。
3. Domain型、Fraction、Score validation、Score Compilerを実装する。
4. 人工 `DetectedStroke[]` generatorを実装する。
5. offsetを考慮したDP matcherを実装する。
6. timing、actual tempo、internal rhythmの評価を実装する。
7. dynamics、accent、rollはI/Oと基礎統計まで実装する。
8. fixtureとunit testを十分に用意する。
9. READMEへ実行方法、未実装範囲、設計判断を記録する。

完了報告には以下を含める。

- 変更ファイルの要約
- 実装した仕様項目
- 保留した仕様項目と理由
- 実行したtest、lint、typecheckの結果
- 次のPhaseで最初に着手すべき項目
- 本仕様からの差異

## 24. 未確定事項と決定方法

以下は実データなしに固定しない。

| 項目 | 決定方法 |
|---|---|
| onset窓幅・閾値 | Python PoCの条件別F1とtiming P95 |
| practice pad／snare preset | ground truth datasetで別parameterが有意か比較 |
| match penalty | synthetic fixtureと実録の誤対応率 |
| Dynamics主指標 | attack strengthとstroke energyの再現性比較 |
| accent合格contrast | 奏者データと主観評価の対応 |
| rollの理想CV | 技量別データを収集して校正 |
| 100点換算 | 十分な実演データとユーザー理解度を基に後から設計 |
| スマホ正式対応 | AGC無効化可否、処理性能、実機精度を検証 |
| native化 | Browser入力が要求精度を満たさないことを実測してから判断 |

## 25. 将来拡張時の境界

### 25.1 Native audio

```ts
export interface AudioSource {
  prepare(): Promise<AudioSourceInfo>;
  start(): Promise<void>;
  stop(): Promise<PcmRecording>;
  dispose(): Promise<void>;
}
```

Browser版と将来のTauri／native版はこのinterfaceより下だけを差し替える。DSP以降はFloat32 PCMを入力として共有する。

### 25.2 WASM

性能上の必要性が計測された場合のみDSPをRust／WASMへ移す。Domain、Matcher、Evaluatorまで一括でWASM化しない。

### 25.3 Buzz roll

通常のDetectedStroke列だけでは意味が曖昧なため、将来 `StrokeMode` と `RollSignalMode` を分離し、包絡線・連続音テクスチャを評価する別経路として設計する。

### 25.4 Absolute latency calibration

クリックをマイクまたはloopbackで同時収録し、input／outputを合わせた遅延を測るcalibration sessionを追加できるようにする。MVPのoffset除去方式を削除せず、calibrated／uncalibratedを結果へ明記する。

## 26. Definition of Done

MVP全体が完了したとみなす条件は次の通り。

- GUIで12／24分を含む譜面、accent、measured／unmeasured roll、crescendo／decrescendoを作成できる
- デスクトップChromeで録音でき、停止後にDetectedStrokeが生成される
- miss／extraがあっても残りの打点を妥当に対応付けられる
- targetとactualを共通タイムラインで確認できる
- click timingとinternal rhythmを分けて表示できる
- Dynamics、accent、rollの基礎統計と信頼度警告を表示できる
- 結果を保存し、再度開ける
- 同じ入力とconfigから同じ結果を再現できる
- 主要ロジックに自動testがある
- ブラウザ音声設定、clipping、低信頼をユーザーへ隠さない
- 検出性能をground truthに対して測る研究用経路がある

## 27. 実装上の禁止事項

- 最大振幅sampleを無条件にattack timeとする
- targetのi番目とdetectedのi番目を単純対応する
- beat位置を保存時から浮動小数点だけで管理する
- unmeasured rollを恣意的な固定間隔の正解打点列へ展開する
- AGC等を無効化要求しただけで、無効になったとみなす
- MediaRecorderの圧縮出力だけを高精度解析の原本とする
- click timingとinternal rhythmを同じ1指標へ混ぜる
- 欠測や低信頼を0誤差として集計する
- 根拠なく100点換算を固定する
- UI component内へDSP、matching、evaluationロジックを書く
- 録音停止後もMediaStream trackやAudioWorkletを残す
- grid division変更時に既存譜面位置を破壊する

---

本仕様の最重要契約は、`ScoreDocument -> TargetPerformance` と `PCM -> DetectedStroke[]` を独立させ、その後段を純粋なmatching／evaluationとして実装することである。この契約を守れば、アタック検出の研究、譜面UI、ブラウザ音声入力を互いに待たずに進められ、将来のWASM化やnative化にも対応できる。
