import { describe, expect, it } from "vitest";
import { fanout } from "../src/internal/fanout";
import { Lfo, phasedWave } from "../src/internal/lfo";

const render = async (frames: number, build: (ctx: OfflineAudioContext) => void) => {
  const ctx = new OfflineAudioContext(1, frames, 44100);
  build(ctx);
  return (await ctx.startRendering()).getChannelData(0);
};

describe("fanout", () => {
  it("drives two gains from one source", async () => {
    const out = await render(256, (ctx) => {
      const a = new GainNode(ctx),
        b = new GainNode(ctx);
      const cs = new ConstantSourceNode(ctx, { offset: 1 });
      cs.start();
      cs.connect(a);
      cs.connect(b);
      fanout(ctx, 0.25, [a.gain, b.gain]);
      a.connect(ctx.destination);
      b.connect(ctx.destination);
    });
    expect(out[200]).toBeCloseTo(0.5, 5); // 0.25 + 0.25
  });
});

describe("phasedWave", () => {
  it("phase 0 sawtooth matches the built-in sawtooth", async () => {
    const [builtin, custom] = await Promise.all([
      render(4410, (ctx) => {
        const o = new OscillatorNode(ctx, { type: "sawtooth", frequency: 10 });
        o.connect(ctx.destination);
        o.start();
      }),
      render(4410, (ctx) => {
        const o = new OscillatorNode(ctx, { frequency: 10, periodicWave: phasedWave(ctx, "sawtooth", 0) });
        o.connect(ctx.destination);
        o.start();
      }),
    ]);
    // compare away from the discontinuity
    for (const i of [500, 1000, 1500, 3000]) expect(custom[i]).toBeCloseTo(builtin[i]!, 1);
  });
  it("a 180° sawtooth is the 0° sawtooth half a period later", async () => {
    const out = await render(4410, (ctx) => {
      const o = new OscillatorNode(ctx, { frequency: 10, periodicWave: phasedWave(ctx, "sawtooth", 180) });
      o.connect(ctx.destination);
      o.start();
    });
    const ref = await render(4410, (ctx) => {
      const o = new OscillatorNode(ctx, { frequency: 10, periodicWave: phasedWave(ctx, "sawtooth", 0) });
      o.connect(ctx.destination);
      o.start();
    });
    expect(out[1000]).toBeCloseTo(ref[1000 + 2205]!, 1);
  });
});

describe("Lfo", () => {
  it("maps −1..1 into min..max on the target", async () => {
    const out = await render(4410, (ctx) => {
      const g = new GainNode(ctx, { gain: 0 });
      const cs = new ConstantSourceNode(ctx, { offset: 1 });
      cs.start();
      cs.connect(g);
      g.connect(ctx.destination);
      const lfo = new Lfo(ctx, { shape: "sine", frequency: 10, min: 0.2, max: 0.8 });
      lfo.connect(g.gain);
      lfo.start();
    });
    let min = Infinity,
      max = -Infinity;
    for (const v of out) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeCloseTo(0.2, 2);
    expect(max).toBeCloseTo(0.8, 2);
  });
});
