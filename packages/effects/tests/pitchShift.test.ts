import { describe, expect, it, vi } from "vitest";
import { PitchShift } from "../src";
import { GranularShifter } from "../src/pitch/GranularShifter";

function dominantHz(frame: Float32Array, sr: number, lo = 200, hi = 1200): number {
  let best = 0,
    bestMag = 0;
  for (let f = lo; f <= hi; f += 5) {
    let re = 0,
      im = 0;
    for (let n = 0; n < frame.length; n++) {
      const w = (2 * Math.PI * f * n) / sr;
      re += frame[n]! * Math.cos(w);
      im -= frame[n]! * Math.sin(w);
    }
    const m = Math.hypot(re, im);
    if (m > bestMag) {
      bestMag = m;
      best = f;
    }
  }
  return best;
}
export async function renderShift(build: (ctx: OfflineAudioContext) => PitchShift): Promise<Float32Array> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const fx = build(ctx);
  await fx.ready;
  const osc = new OscillatorNode(ctx, { frequency: 440 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0).subarray(22050, 22050 + 8820);
}

describe("PitchShift (granular)", () => {
  it("+12 semitones doubles the dominant frequency (± one 5 Hz bin, granular smear allowed)", async () => {
    const f = await renderShift((ctx) => new PitchShift(ctx, { pitch: 12 }));
    expect(Math.abs(dominantHz(f, 44100) - 880)).toBeLessThanOrEqual(15);
  });
  it("−12 semitones halves it", async () => {
    const f = await renderShift((ctx) => new PitchShift(ctx, { pitch: -12 }));
    expect(Math.abs(dominantHz(f, 44100, 100, 600) - 220)).toBeLessThanOrEqual(15);
  });
  it("pitch 0 leaves 440 in place and isReady is immediate; latency is the window", async () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const fx = new PitchShift(ctx, { windowSize: 0.05 });
    expect(fx.cells.isReady.value).toBe(true);
    expect(fx.latency.value).toBe(Math.round(0.05 * 44100));
    const f = await renderShift((c) => new PitchShift(c, { pitch: 0 }));
    expect(Math.abs(dominantHz(f, 44100) - 440)).toBeLessThanOrEqual(10);
  });

  it("destroy() tears down the granular wet arm", () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const spy = vi.spyOn(GranularShifter.prototype, "destroy");
    const fx = new PitchShift(ctx);
    fx.destroy();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
