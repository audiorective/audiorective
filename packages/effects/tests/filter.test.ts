import { describe, expect, it } from "vitest";
import { Filter } from "../src";

/** RMS of a rendered sine through `build`, steady-state (skip the first half). */
async function rmsThrough(freq: number, build: (ctx: OfflineAudioContext) => Filter): Promise<number> {
  const ctx = new OfflineAudioContext(1, 44100, 44100);
  const fx = build(ctx);
  const osc = new OscillatorNode(ctx, { frequency: freq });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  const d = (await ctx.startRendering()).getChannelData(0);
  let sum = 0;
  const from = d.length / 2;
  for (let i = from; i < d.length; i++) sum += d[i]! * d[i]!;
  return Math.sqrt(sum / (d.length - from));
}
const db = (a: number, b: number) => 20 * Math.log10(a / b);

describe("Filter", () => {
  it("lowpass at 1 kHz passes 100 Hz and attenuates 4 kHz by ≥ 12 dB per stage", async () => {
    const pass = await rmsThrough(100, (ctx) => new Filter(ctx, { frequency: 1000, type: "lowpass" }));
    const cut12 = await rmsThrough(4000, (ctx) => new Filter(ctx, { frequency: 1000, type: "lowpass", rolloff: -12 }));
    const cut24 = await rmsThrough(4000, (ctx) => new Filter(ctx, { frequency: 1000, type: "lowpass", rolloff: -24 }));
    expect(db(pass, Math.SQRT1_2)).toBeGreaterThan(-1);
    expect(db(cut12, Math.SQRT1_2)).toBeLessThan(-20);
    expect(db(cut24, Math.SQRT1_2)).toBeLessThan(db(cut12, Math.SQRT1_2) - 15);
  });
  it("type switches live and frequency ramps are honoured", async () => {
    const hp = await rmsThrough(100, (ctx) => {
      const f = new Filter(ctx, { frequency: 1000 });
      f.params.type.value = "highpass";
      return f;
    });
    expect(db(hp, Math.SQRT1_2)).toBeLessThan(-30);
    const ramped = await rmsThrough(4000, (ctx) => {
      const f = new Filter(ctx, { frequency: 200, type: "lowpass" });
      f.params.frequency.linearRampToValueAtTime(20000, 0.4); // fully open before the measured half
      return f;
    });
    expect(db(ramped, Math.SQRT1_2)).toBeGreaterThan(-1);
  });
});
