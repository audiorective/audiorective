import { describe, expect, it } from "vitest";
import { PitchShift } from "../src";
import { dominantHz, renderShift } from "./helpers/spectrum";

describe("PitchShift (stretch)", () => {
  it("+12 semitones doubles the dominant frequency within one bin", async () => {
    const f = await renderShift((ctx) => new PitchShift(ctx, { pitch: 12, engine: "stretch" }));
    expect(Math.abs(dominantHz(f, 44100) - 880)).toBeLessThanOrEqual(5);
  });
  it("reports isReady after load and a positive latency the graph adopts", async () => {
    const ctx = new OfflineAudioContext(2, 4096, 44100);
    const fx = new PitchShift(ctx, { engine: "stretch", stretch: { blockMs: 40 } });
    expect(fx.cells.isReady.value).toBe(false);
    await fx.ready;
    expect(fx.cells.isReady.value).toBe(true);
    expect(fx.latency.value).toBeGreaterThan(0);
    expect(fx.latency.value).toBeLessThan(0.2 * 44100);
  });
});
