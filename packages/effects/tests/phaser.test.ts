import { describe, expect, it } from "vitest";
import { Phaser } from "../src";

async function renderNoise(build: (ctx: OfflineAudioContext) => Phaser, seconds = 1) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const fx = build(ctx);
  const noise = ctx.createBuffer(1, sr * seconds, sr);
  const d = noise.getChannelData(0);
  let seed = 1;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}
/** Magnitude at `bin` of a naive DFT over `frame` (small N keeps this cheap). */
function magnitude(frame: Float32Array, freq: number, sr: number): number {
  let re = 0,
    im = 0;
  for (let n = 0; n < frame.length; n++) {
    const w = (2 * Math.PI * freq * n) / sr;
    re += frame[n]! * Math.cos(w);
    im -= frame[n]! * Math.sin(w);
  }
  return Math.hypot(re, im) / frame.length;
}

describe("Phaser", () => {
  it("with the LFO stopped (frequency 0) the spectrum has notches the dry signal lacks", async () => {
    const wet = await renderNoise((ctx) => new Phaser(ctx, { frequency: 0, baseFrequency: 500, octaves: 0, Q: 10, stages: 5 }));
    const dry = await renderNoise((ctx) => new Phaser(ctx, { frequency: 0, baseFrequency: 500, octaves: 0, Q: 10, stages: 5, wet: 0 }));
    const frame = (b: AudioBuffer) => b.getChannelData(0).subarray(20000, 20000 + 4096);
    // 5 allpass stages sit at 180° at 500 Hz; summed with dry inside the wet arm → deep notch near 500 Hz
    const ratio = magnitude(frame(wet), 500, 44100) / magnitude(frame(dry), 500, 44100);
    expect(ratio).toBeLessThan(0.3);
  });
  it("with the LFO running the notch moves over time", async () => {
    const wet = await renderNoise((ctx) => new Phaser(ctx, { frequency: 2, baseFrequency: 300, octaves: 3, Q: 10 }), 1);
    const d = wet.getChannelData(0);
    const a = magnitude(d.subarray(4096, 8192), 300, 44100);
    const b = magnitude(d.subarray(4096 + 11025, 8192 + 11025), 300, 44100); // quarter LFO period later
    expect(Math.abs(a - b) / Math.max(a, b)).toBeGreaterThan(0.2);
  });
});
