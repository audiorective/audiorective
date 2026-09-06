import { describe, expect, it } from "vitest";
import { DynamicsCore } from "../src/dynamics/DynamicsCore";

async function renderThrough(opts: ConstructorParameters<typeof DynamicsCore>[1], amplitude: number, seconds = 1) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const core = new DynamicsCore(ctx, opts);
  await core.ready;
  const osc = new OscillatorNode(ctx, { frequency: 1000 });
  const g = new GainNode(ctx, { gain: amplitude });
  osc.connect(g);
  g.connect(core.input);
  core.output.connect(ctx.destination);
  osc.start();
  const buf = await ctx.startRendering();
  return { buf, core };
}
const peakFrom = (d: Float32Array, from: number) => {
  let m = 0;
  for (let i = from; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
  return m;
};
const db = (x: number) => 20 * Math.log10(x);

describe("DynamicsCore", () => {
  it("below threshold is unity", async () => {
    const { buf } = await renderThrough({ threshold: -6, ratio: 4, knee: 0, attack: 0.001, release: 0.05, makeup: 0, lookahead: 0 }, 0.1);
    expect(peakFrom(buf.getChannelData(0), 22050)).toBeCloseTo(0.1, 3);
  });
  it("ratio 4 above threshold settles to the gain-computer value ±0.1 dB", async () => {
    // input −6 dBFS peak, threshold −24, ratio 4 → output = −24 + 18/4 = −19.5 dBFS
    const { buf } = await renderThrough({ threshold: -24, ratio: 4, knee: 0, attack: 0.001, release: 0.05, makeup: 0, lookahead: 0 }, 0.5);
    // sample-level peak detection with a 1 ms attack ripples a few tenths of a dB on a sine; the static gain-computer value is the target, ±0.5 dB
    expect(Math.abs(db(peakFrom(buf.getChannelData(0), 22050)) - -19.5)).toBeLessThan(0.5);
  });
  it("makeup adds gain and reduction is reported", async () => {
    const { buf, core } = await renderThrough({ threshold: -24, ratio: 4, knee: 0, attack: 0.001, release: 0.05, makeup: 6, lookahead: 0 }, 0.5);
    expect(Math.abs(db(peakFrom(buf.getChannelData(0), 22050)) - -13.5)).toBeLessThan(0.5);
    expect(core.cells.reduction.value).toBeLessThan(-12);
  });
  it("lookahead delays the signal by exactly lookahead samples and declares it", async () => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, 2048, sr);
    const core = new DynamicsCore(ctx, { threshold: 0, ratio: 1, knee: 0, attack: 0, release: 0.1, makeup: 0, lookahead: 0.005 });
    await core.ready;
    expect(core.latency.value).toBe(Math.round(0.005 * sr));
    const imp = ctx.createBuffer(1, 1, sr);
    imp.getChannelData(0)[0] = 1;
    const s = new AudioBufferSourceNode(ctx, { buffer: imp });
    s.connect(core.input);
    core.output.connect(ctx.destination);
    s.start();
    const d = (await ctx.startRendering()).getChannelData(0);
    let idx = -1;
    for (let i = 0; i < d.length; i++)
      if (Math.abs(d[i]!) > 0.5) {
        idx = i;
        break;
      }
    expect(idx).toBe(Math.round(0.005 * sr));
  });
});
