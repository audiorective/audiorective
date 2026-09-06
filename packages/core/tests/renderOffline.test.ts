import { describe, expect, it } from "vitest";
import { Sampler, renderOffline } from "../src";

describe("renderOffline", () => {
  it("renders the requested length at the requested rate and awaits async setup", async () => {
    const buf = await renderOffline({ seconds: 0.5, channels: 1, sampleRate: 48000 }, async (ctx) => {
      await new Promise((r) => setTimeout(r, 5));
      const hit = ctx.createBuffer(1, 480, 48000);
      hit.getChannelData(0).fill(0.5);
      const s = new Sampler(ctx);
      s.buffer = hit;
      s.output.connect(ctx.destination);
      s.trigger({ when: 0.1 });
    });
    expect(buf.sampleRate).toBe(48000);
    expect(buf.length).toBe(24000);
    expect(buf.numberOfChannels).toBe(1);
    expect(buf.getChannelData(0)[4800 + 100]).toBeCloseTo(0.5, 5);
    expect(buf.getChannelData(0)[100]).toBe(0);
  });
  it("defaults to stereo at 44.1 kHz", async () => {
    const buf = await renderOffline({ seconds: 0.01 }, () => {});
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.sampleRate).toBe(44100);
  });
});
