import { describe, expect, it } from "vitest";
import { FrequencyShifter } from "../src";

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
async function shifted(shift: number) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const fx = new FrequencyShifter(ctx, { frequency: shift });
  const osc = new OscillatorNode(ctx, { frequency: 440 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0).subarray(22050, 22050 + 8820); // 0.2 s frame → 5 Hz bins
}
const db = (a: number, b: number) => 20 * Math.log10(a / b);

describe("FrequencyShifter", () => {
  it("+100 Hz moves 440 → 540 with the 340 Hz image ≥ 30 dB down", async () => {
    const f = await shifted(100);
    const up = magnitude(f, 540, 44100),
      down = magnitude(f, 340, 44100),
      orig = magnitude(f, 440, 44100);
    expect(db(down, up)).toBeLessThan(-30);
    expect(db(orig, up)).toBeLessThan(-30);
  });
  it("−100 Hz selects the lower sideband", async () => {
    const f = await shifted(-100);
    expect(db(magnitude(f, 540, 44100), magnitude(f, 340, 44100))).toBeLessThan(-30);
  });
  it("0 Hz passes the tone (allowing the Hilbert phase shift)", async () => {
    const f = await shifted(0);
    expect(magnitude(f, 440, 44100)).toBeGreaterThan(0.4);
  });
});
