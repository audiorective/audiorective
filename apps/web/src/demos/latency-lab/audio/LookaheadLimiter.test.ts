import { describe, expect, it } from "vitest";
import { LookaheadLimiter, loadLimiterWorklet } from "./LookaheadLimiter";

// Worklet processors measure with a pre-loaded context: the module must be added to
// the exact OfflineAudioContext that renders, so the test owns the context.
async function measure(sampleRate: number) {
  const ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
  await loadLimiterWorklet(ctx);
  const proc = new LookaheadLimiter(ctx, { lookaheadSeconds: 0.02 });
  const buffer = new AudioBuffer({ length: 1, sampleRate });
  buffer.getChannelData(0)[0] = 1;
  const src = new AudioBufferSourceNode(ctx, { buffer });
  src.connect(proc.input);
  proc.output.connect(ctx.destination);
  src.start(0);
  const out = (await ctx.startRendering()).getChannelData(0);
  const firstArrival = out.findIndex((v) => Math.abs(v) > 1e-4);
  return { firstArrival, declared: proc.latency.value };
}

describe("LookaheadLimiter latency", () => {
  it("declares the latency it actually has, at both sample rates", async () => {
    for (const rate of [44100, 48000]) {
      const { firstArrival, declared } = await measure(rate);
      expect(declared).toBe(Math.round(0.02 * rate));
      expect(firstArrival).toBe(declared);
    }
  });
});
