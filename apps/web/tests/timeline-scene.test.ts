import { describe, expect, it } from "vitest";
import { buildWaveformOverview } from "../src/audio";
import {
  createDenseDemoScenario,
  createGoldenDemoScenario,
} from "../src/fixtures/demo-scenarios";
import {
  buildTimelineScene,
  fitViewport,
  hitTest,
  timelineBounds,
} from "../src/ui/timeline";

describe("timeline scene", () => {
  it("builds every Phase 3 glyph from the golden fixture", () => {
    const scenario = createGoldenDemoScenario();
    const viewport = fitViewport(timelineBounds(scenario.data));
    const scene = buildTimelineScene(
      scenario.data,
      viewport,
      1_100,
      286,
      "overlay",
    );

    expect(scene.regions).toHaveLength(3);
    expect(scene.regions.map((glyph) => glyph.region.type)).toEqual(
      expect.arrayContaining(["roll", "crescendo"]),
    );
    expect(scene.targets).toHaveLength(8);
    expect(
      scene.targets.filter((glyph) => glyph.missed).map((glyph) => glyph.id),
    ).toEqual(["stroke:s1"]);
    expect(
      scene.detected
        .filter((glyph) => glyph.status === "extra")
        .map((glyph) => glyph.id),
    ).toEqual(["extra-outside"]);
    expect(
      scene.detected.filter((glyph) => glyph.status === "roll"),
    ).toHaveLength(7);
    expect(scene.matches).toHaveLength(7);
  });

  it("honors target-only and actual-only display modes", () => {
    const scenario = createGoldenDemoScenario();
    const viewport = fitViewport(timelineBounds(scenario.data));
    const targetOnly = buildTimelineScene(
      scenario.data,
      viewport,
      900,
      286,
      "target",
    );
    const actualOnly = buildTimelineScene(
      scenario.data,
      viewport,
      900,
      286,
      "actual",
    );
    expect(targetOnly.detected).toEqual([]);
    expect(targetOnly.matches).toEqual([]);
    expect(actualOnly.targets).toEqual([]);
    expect(actualOnly.matches).toEqual([]);
  });

  it("gives strokes hit-test priority over an overlapping region", () => {
    const scenario = createGoldenDemoScenario();
    const viewport = fitViewport(timelineBounds(scenario.data));
    const scene = buildTimelineScene(
      scenario.data,
      viewport,
      900,
      286,
      "overlay",
    );
    const target = scene.targets[0]!;
    const selected = hitTest(
      [
        {
          selection: { kind: "region", id: "region" },
          x: target.x - 20,
          y: target.y - 20,
          width: 40,
          height: 40,
          priority: 1,
        },
        {
          selection: { kind: "target", id: target.id },
          x: target.x - 10,
          y: target.y - 10,
          width: 20,
          height: 20,
          priority: 3,
        },
      ],
      target.x,
      target.y,
    );
    expect(selected).toEqual({ kind: "target", id: target.id });
  });

  it("culls a 4,000-stroke fixture to the visible window", () => {
    const scenario = createDenseDemoScenario();
    const scene = buildTimelineScene(
      scenario.data,
      { startSec: 100, endSec: 101 },
      1_200,
      286,
      "overlay",
    );
    expect(scenario.data.target.strokes).toHaveLength(4_000);
    expect(scene.targets.length).toBeGreaterThan(10);
    expect(scene.targets.length).toBeLessThan(30);
    expect(scene.detected.length).toBeLessThan(30);
    expect(scene.gridLines.length).toBeLessThan(100);
  });

  it("adds and hides the downsampled recording waveform", () => {
    const scenario = createGoldenDemoScenario();
    const data = {
      ...scenario.data,
      waveform: buildWaveformOverview(
        Float32Array.of(0, 0.5, -0.5, 1, -1, 0),
        10,
        3,
      ),
    };
    const viewport = fitViewport(timelineBounds(data));
    expect(
      buildTimelineScene(data, viewport, 900, 286, "overlay").waveform.length,
    ).toBeGreaterThan(0);
    expect(
      buildTimelineScene(data, viewport, 900, 286, "overlay", false).waveform,
    ).toEqual([]);
  });
});
