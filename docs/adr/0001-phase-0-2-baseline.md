# ADR 0001: Phase 0–2 baseline decisions

- Status: Accepted
- Date: 2026-09-02

## Decisions and specification differences

1. `TargetStroke.id` は通常打を `stroke:<source id>`、measured roll打点を `roll:<region id>:<normalized fraction>` と名前空間化する。入力上stroke idとregion idが同じでも出力IDが衝突せず、出力が配列順に依存しないためである。元IDは `sourceStrokeId` / `sourceRegionId` に保持する。
2. tempo mapの秒からbeatへの逆変換は `secondsToBeatPosition(): number` を返す。任意の浮動小数BPMと秒から得るbeatは一般にsafe-integer Fractionで正確に表せないためである。保存される譜面位置とcompiler入力では引き続きFractionだけを使う。
3. Phase 2のDPは完全行列で実装する。仕様は短いセッションで完全DPを許容しており、band化は数千打の性能fixtureと回帰testを用意してから行う。
4. unmeasured rollはoffset候補ごとに、設定された境界marginより内側の検出打点を通常DPから排他的に除外する。境界margin内は隣接通常打との対応を優先し、1打の二重帰属を禁止する。
5. Dynamics/accent/rollの閾値は未校正なので、Phase 2では物理量・基礎統計とstatus/reason codeだけを返す。合否や100点換算は追加しない。
