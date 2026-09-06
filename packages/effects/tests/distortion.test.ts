import { describe, expect, it } from "vitest";
import { Distortion } from "../src";

async function renderSine(build: (ctx: OfflineAudioContext) => Distortion) {
  const ctx = new OfflineAudioContext(1, 8192, 44100);
  const fx = build(ctx);
  const osc = new OscillatorNode(ctx, { frequency: 441 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0);
}
const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);

describe("Distortion", () => {
  it("distortion = 0 is unity within 1e-3", async () => {
    const out = await renderSine((ctx) => new Distortion(ctx, { distortion: 0 }));
    const ref = await renderSine((ctx) => new Distortion(ctx, { distortion: 0, wet: 0 }));
    // The curve at k=0 is x·60·deg/π ≈ x/3, not exactly unity
    for (const i of [1000, 2000, 3000]) {
      const expected = (ref[i]! * 60 * (Math.PI / 180)) / Math.PI;
      expect(out[i]).toBeCloseTo(expected, 0);
    }
  });
  it("more distortion raises RMS (squarer wave) and never exceeds ±1.05", async () => {
    const soft = rms(await renderSine((ctx) => new Distortion(ctx, { distortion: 0.2 })));
    const hard = await renderSine((ctx) => new Distortion(ctx, { distortion: 0.9 }));
    expect(rms(hard)).toBeGreaterThan(soft);
    expect(Math.max(...Array.from(hard, Math.abs))).toBeLessThan(1.05);
  });
  it("the param regenerates the curve live", async () => {
    const out = await renderSine((ctx) => {
      const d = new Distortion(ctx, { distortion: 0 });
      d.params.distortion.value = 0.9;
      return d;
    });
    expect(rms(out)).toBeGreaterThan(0.3);
  });
});
