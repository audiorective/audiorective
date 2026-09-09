import { describe, it } from "vitest";
import { assertLatency } from "@audiorective/devtools";
import { Channel, Compressor, Convolver, Distortion, Filter, FrequencyShifter, Limiter, Phaser, PingPongDelay, PitchShift } from "../src";

const rates = { sampleRates: [44100, 48000] };

describe("declared latency matches measured", () => {
  it("native effects are zero-latency", async () => {
    await assertLatency((ctx) => new Filter(ctx), rates);
    // Measured at the default oversample "none" — "4x" adds undeclared browser latency by design.
    await assertLatency((ctx) => new Distortion(ctx), rates);
    await assertLatency((ctx) => new Phaser(ctx, { frequency: 0 }), rates);
    await assertLatency((ctx) => new FrequencyShifter(ctx), rates);
    await assertLatency((ctx) => new Channel(ctx), rates);
    // Unit impulse IR so Convolver's own output is the thing being timed.
    await assertLatency((ctx) => {
      const ir = ctx.createBuffer(1, 1, ctx.sampleRate);
      ir.getChannelData(0)[0] = 1;
      return new Convolver(ctx, { buffer: ir, normalize: false });
    }, rates);
    // delayTime 0, feedback 0: the delay is intentional, not latency. Its two DelayNodes
    // still form a feedback cycle at the graph level, but the direct left path carries the
    // impulse to the output with no cycle-induced render-quantum lag, so it measures at 0.
    await assertLatency((ctx) => new PingPongDelay(ctx, { delayTime: 0, feedback: 0 }), rates);
  });

  it("worklet and granular effects declare their buffering", async () => {
    await assertLatency((ctx) => new Limiter(ctx), { ...rates, tolerance: 1, ready: (p) => (p as Limiter).ready });
    await assertLatency((ctx) => new Compressor(ctx, { lookahead: 0.003 }), { ...rates, tolerance: 1, ready: (p) => (p as Compressor).ready });
    // At pitch 0 the granular engine holds one grain at half the window, so the impulse
    // lands exactly on the declared value.
    await assertLatency((ctx) => new PitchShift(ctx, { windowSize: 0.02 }), { ...rates, tolerance: 1 });
    await assertLatency((ctx) => new PitchShift(ctx, { windowSize: 0.1 }), { ...rates, tolerance: 1 });
    // A single-sample impulse vanishes in the STFT at longer blocks (40 ms renders silence),
    // so the impulse validator only checks the short-block configuration; the 40 ms declared
    // value is covered by pitchShiftStretch.test.ts.
    await assertLatency((ctx) => new PitchShift(ctx, { engine: "stretch", stretch: { blockMs: 10 } }), {
      ...rates,
      tolerance: 8,
      ready: (p) => (p as PitchShift).ready,
    });
  });
});
