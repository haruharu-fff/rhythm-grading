# Shared fixture conventions

`fixtures/` はTypeScriptとPythonから同じ意味で読めるJSONだけを置きます。

- `scores/`: `ScoreDocument` JSON。読込時に必ずvalidationとFraction正規化を通す
- `performances/`: synthetic generator設定、または将来の `DetectedStroke[]`
- `expected/`: match pair、miss、extra、集約値などのgolden期待値
- `audio/`: Phase 4以降の短い共有PCM/WAV

時刻は秒、timing差は秒、強度はdB、beat位置はFractionで保存します。golden testではID対応を完全一致で確認し、浮動小数点だけ許容誤差を明記します。欠測は `null` とし、0へ置換しません。

人工演奏設定の `injectedStrokes` は、通常のextra候補だけでなくunmeasured roll内の個別正解時刻を持たない打点にも使います。最終的にextraかroll帰属かを決めるのはMatcherです。
