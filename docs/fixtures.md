# Shared fixture conventions

`fixtures/` はTypeScriptとPythonから同じ意味で読めるJSONだけを置きます。

- `scores/`: `ScoreDocument` JSON。読込時に必ずvalidationとFraction正規化を通す
- `performances/`: synthetic generator設定、または将来の `DetectedStroke[]`
- `expected/`: match pair、miss、extra、集約値などのgolden期待値
- `audio/`: Phase 4以降の短い共有PCM/WAV

時刻は秒、timing差は秒、強度はdB、beat位置はFractionで保存します。golden testではID対応を完全一致で確認し、浮動小数点だけ許容誤差を明記します。欠測は `null` とし、0へ置換しません。

人工演奏設定の `injectedStrokes` は、通常のextra候補だけでなくunmeasured roll内の個別正解時刻を持たない打点にも使います。最終的にextraかroll帰属かを決めるのはMatcherです。

## Phase 4 ground truth

ground truth JSONは次の形とします。

```json
{
  "schemaVersion": "1.0",
  "audioPath": "take.wav",
  "sampleRate": 48000,
  "frameCount": 96000,
  "durationSec": 2.0,
  "labels": {
    "instrument": "practice-pad",
    "tempoBpm": 120,
    "pattern": "single-stroke"
  },
  "events": [
    {
      "id": "truth-00",
      "sampleIndex": 24000,
      "timeSec": 0.5,
      "labels": { "strength": "medium" }
    }
  ]
}
```

- `sampleIndex` が0以上で、`timeSec = sampleIndex / sampleRate` を満たすこと
- eventは`sampleIndex`昇順で、idは一意であること
- `labels`は集計軸であり、既定の合否判定には使わないこと
- WAVのsample rate／frame countとtruthが一致しない場合は処理を中止すること

dataset manifestは、manifest自身からの相対pathでWAVとtruthを参照します。

```json
{
  "schemaVersion": "1.0",
  "items": [
    {
      "id": "pad-120-medium-01",
      "wavPath": "pad-120-medium-01.wav",
      "truthPath": "pad-120-medium-01-truth.json",
      "labels": {
        "instrument": "practice-pad",
        "tempoBpm": 120,
        "strength": "medium"
      }
    }
  ]
}
```
