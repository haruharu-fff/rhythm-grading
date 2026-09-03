import { describe, expect, it } from "vitest";
import { createGoldenDemoScenario } from "../src/fixtures/demo-scenarios";
import { summarizeTempoMap } from "../src/ui/session/tempo-summary";

describe("summarizeTempoMap", () => {
  it("shows every BPM and the beat where a tempo change starts", () => {
    const summary = summarizeTempoMap(
      createGoldenDemoScenario().data.target.tempoMap,
    );

    expect(summary).toEqual({
      bpm: "120 → 90 BPM",
      changes: "4拍から90 BPM",
    });
  });

  it("labels a constant-tempo score", () => {
    const summary = summarizeTempoMap([
      {
        startBeat: { numerator: 0, denominator: 1 },
        endBeat: { numerator: 8, denominator: 1 },
        startTimeSec: 0,
        endTimeSec: 8 / 3,
        bpm: 180,
      },
    ]);

    expect(summary).toEqual({ bpm: "180 BPM", changes: "全区間一定" });
  });
});
