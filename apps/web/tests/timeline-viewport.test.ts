import { describe, expect, it } from "vitest";
import { createGoldenDemoScenario } from "../src/fixtures/demo-scenarios";
import {
  clampViewport,
  fitViewport,
  panViewport,
  timeToX,
  timelineBounds,
  timelineLayout,
  xToTime,
  zoomViewport,
} from "../src/ui/timeline";

describe("timeline viewport", () => {
  it("round-trips between time and canvas coordinates", () => {
    const viewport = { startSec: 1, endSec: 5 };
    const layout = timelineLayout(1_000, 286);
    const x = timeToX(2.75, viewport, layout);
    expect(xToTime(x, viewport, layout)).toBeCloseTo(2.75, 12);
  });

  it("zooms around the pointer anchor and clamps panning", () => {
    const bounds = { startSec: 0, endSec: 10 };
    const viewport = fitViewport(bounds);
    const zoomed = zoomViewport(viewport, 2.5, 2, bounds);
    expect(zoomed).toEqual({ startSec: 1.25, endSec: 6.25 });
    expect(panViewport(zoomed, 100, bounds)).toEqual({
      startSec: 5,
      endSec: 10,
    });
    expect(clampViewport({ startSec: -4, endSec: 40 }, bounds)).toEqual(bounds);
  });

  it("includes offset-adjusted actual strokes in fit-all bounds", () => {
    const scenario = createGoldenDemoScenario();
    const bounds = timelineBounds(scenario.data);
    expect(bounds.startSec).toBeLessThan(0);
    expect(bounds.endSec).toBeGreaterThan(scenario.data.target.durationSec);
  });
});
