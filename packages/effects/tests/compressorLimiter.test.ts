import { describe, expect, it } from "vitest";
import { Compressor, Limiter } from "../src";

const db = (x: number) => 20 * Math.log10(x);
async function renderNoise(build: (ctx: OfflineAudioContext) => Compressor | Limiter, gain: number) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr, sr);
  const fx = build(ctx);
  await fx.ready;
  const noise = ctx.createBuffer(2, sr, sr);
  for (let c = 0; c < 2; c++) {
    const d = noise.getChannelData(c);
    let seed = 7 + c;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * gain;
    }
  }
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  src.start();
  return { buf: await ctx.startRendering(), fx };
}

describe("Limiter", () => {
  it("+6 dBFS noise never exceeds threshold + 0.1 dB after the lookahead settles", async () => {
    const { buf, fx } = await renderNoise((ctx) => new Limiter(ctx, { threshold: -1 }), 2);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let peak = 0;
      for (let i = 1000; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
      expect(db(peak)).toBeLessThanOrEqual(-1 + 0.1);
    }
    expect(fx.latency.value).toBe(Math.round(0.005 * 44100));
    expect(fx.cells.reduction.value).toBeLessThan(-5);
  });
});

describe("Compressor", () => {
  it("exposes all six params and reports reduction", async () => {
    const { fx } = await renderNoise((ctx) => new Compressor(ctx, { threshold: -30, ratio: 8 }), 0.5);
    expect(Object.keys(fx.params).sort()).toEqual(["attack", "knee", "makeup", "ratio", "release", "threshold", "wet"]);
    expect(fx.cells.reduction.value).toBeLessThan(-10);
  });
  it("wet = 0 bypasses (dry aligned through the compensated graph)", async () => {
    const { buf } = await renderNoise((ctx) => new Compressor(ctx, { threshold: -40, ratio: 20, lookahead: 0.002, wet: 0 }), 0.5);
    let peak = 0;
    const d = buf.getChannelData(0);
    for (let i = 1000; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
    expect(peak).toBeGreaterThan(0.45);
  });
});
