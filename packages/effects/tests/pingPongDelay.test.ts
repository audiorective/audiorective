import { describe, expect, it } from "vitest";
import { PingPongDelay } from "../src";

describe("PingPongDelay", () => {
  it("an impulse echoes alternately L/R at delayTime with feedback decay", async () => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, sr, sr);
    const fx = new PingPongDelay(ctx, { delayTime: 0.1, feedback: 0.5 });
    const impulse = ctx.createBuffer(1, 1, sr);
    impulse.getChannelData(0)[0] = 1;
    const src = new AudioBufferSourceNode(ctx, { buffer: impulse });
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    src.start();
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0),
      R = buf.getChannelData(1);
    // Echoes that cross the feedback path arrive one render quantum (~128 samples, ~2.9ms) later than delayTime.
    const at = (d: Float32Array, t: number) => {
      let m = 0;
      for (let i = Math.round(t * sr) - 4; i < Math.round(t * sr) + 260; i++) m = Math.max(m, Math.abs(d[i] ?? 0));
      return m;
    };
    expect(at(L, 0.1)).toBeGreaterThan(0.4);
    expect(at(R, 0.1)).toBeLessThan(0.05);
    expect(at(R, 0.2)).toBeGreaterThan(0.2);
    expect(at(L, 0.2)).toBeLessThan(0.05);
    expect(at(L, 0.3)).toBeGreaterThan(0.1);
    expect(at(L, 0.3)).toBeLessThan(at(L, 0.1));
  });
});
