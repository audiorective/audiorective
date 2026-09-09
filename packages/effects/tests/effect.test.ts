import { describe, expect, it } from "vitest";
import { AudioProcessor } from "@audiorective/core";
import { Effect } from "../src/Effect";

/** Wet arm that inverts polarity — makes wet and dry trivially distinguishable. */
class Inverter extends Effect {
  constructor(ctx: BaseAudioContext, wet?: number) {
    const inv = new GainNode(ctx, { gain: -1 });
    super(ctx, { input: inv, output: inv }, () => ({ params: {}, cells: {} }), { wet });
  }
}

/** Wet arm with 100 samples of declared latency (a DelayNode standing in for a worklet). */
class Latent extends AudioProcessor<{}, {}> {
  private readonly d: DelayNode;
  constructor(ctx: BaseAudioContext) {
    const d = new DelayNode(ctx, { delayTime: 100 / ctx.sampleRate, maxDelayTime: 1 });
    super(ctx, () => ({ params: {}, cells: {}, latency: 100 }));
    this.d = d;
  }
  override get input() {
    return this.d;
  }
  get output() {
    return this.d;
  }
}
class LatentEffect extends Effect {
  constructor(ctx: BaseAudioContext) {
    const arm = new Latent(ctx);
    super(ctx, { input: arm, output: arm }, () => ({ params: {}, cells: {} }));
  }
}

async function render(build: (ctx: OfflineAudioContext) => Effect, frames = 512): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, frames, 44100);
  const fx = build(ctx);
  const src = new ConstantSourceNode(ctx, { offset: 0.5 });
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  src.start();
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

describe("Effect wet/dry", () => {
  it("wet = 0 passes the dry signal unchanged", async () => {
    const out = await render((ctx) => new Inverter(ctx, 0));
    expect(out[400]).toBeCloseTo(0.5, 6);
  });
  it("wet = 1 passes only the effect arm", async () => {
    const out = await render((ctx) => new Inverter(ctx, 1));
    expect(out[400]).toBeCloseTo(-0.5, 6);
  });
  it("wet = 0.25 mixes linearly", async () => {
    const out = await render((ctx) => new Inverter(ctx, 0.25));
    expect(out[400]).toBeCloseTo(0.75 * 0.5 + 0.25 * -0.5, 6);
  });
  it("a ramp on wet is sample-accurate on both arms", async () => {
    const out = await render((ctx) => {
      const fx = new Inverter(ctx, 0);
      fx.params.wet.setValueAtTime(0, 0).linearRampToValueAtTime(1, 256 / ctx.sampleRate);
      return fx;
    });
    // at frame 128 wet ≈ 0.5 → dry 0.25 + wet -0.25 = 0
    expect(Math.abs(out[128]!)).toBeLessThan(0.02);
    expect(out[400]).toBeCloseTo(-0.5, 6);
  });
  it("derives latency from the wet arm and delays the dry arm to match", async () => {
    const ctx = new OfflineAudioContext(1, 1024, 44100);
    const fx = new LatentEffect(ctx);
    fx.params.wet.value = 0.5;
    expect(fx.latency.value).toBe(100);
    const src = new ConstantSourceNode(ctx, { offset: 1 });
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    src.start(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    // both arms arrive together at sample 100: nothing before, full level after
    expect(out[50]).toBeCloseTo(0, 6);
    expect(out[300]).toBeCloseTo(1, 6);
  });
});
