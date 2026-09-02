import { describe, expect, it } from "vitest";
import { AudioProcessor } from "@audiorective/core";
import { assertLatency, measureLatency } from "../src";

const latent = (samples: number | ((rate: number) => number), declare: number | ((rate: number) => number)) => (ctx: BaseAudioContext) => {
  const actual = typeof samples === "function" ? samples(ctx.sampleRate) : samples;
  const declared = typeof declare === "function" ? declare(ctx.sampleRate) : declare;
  class P extends AudioProcessor {
    private readonly d: DelayNode;
    constructor() {
      const d = new DelayNode(ctx, { delayTime: actual / ctx.sampleRate, maxDelayTime: 1 });
      super(ctx, () => ({ latency: declared }));
      this.d = d;
    }
    override get input() {
      return this.d;
    }
    get output() {
      return this.d;
    }
  }
  return new P();
};

// A processor that really delays by N samples AND declares it — the stand-in
// for a buffering effect (a worklet, a lookahead limiter). Copied from
// packages/core/tests/graph-latency.browser.test.ts for the Wet composite below.
class FakeLatent extends AudioProcessor {
  readonly delay: DelayNode;
  constructor(ctx: BaseAudioContext, samples: number) {
    const delay = new DelayNode(ctx, { delayTime: samples / ctx.sampleRate, maxDelayTime: 1 });
    super(ctx, () => ({ latency: samples }));
    this.delay = delay;
  }
  override get input() {
    return this.delay;
  }
  get output() {
    return this.delay;
  }
}

// Two parallel branches (100 and 300 samples) joined internally: contributes a
// single derived latency (max of the branches) wherever it appears as a source.
class Wet extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    const inGain = new GainNode(ctx);
    const outGain = new GainNode(ctx);
    super(ctx, () => ({}));
    const a = new FakeLatent(ctx, 100);
    const b = new FakeLatent(ctx, 300);
    this._in = inGain;
    this._out = outGain;
    this.defineGraph(() => [
      [inGain, a],
      [a, outGain], // branch 100
      [inGain, b],
      [b, outGain], // branch 300 → max 300
    ]);
  }
  private _in!: GainNode;
  private _out!: GainNode;
  override get input() {
    return this._in;
  }
  get output() {
    return this._out;
  }
}

describe("measureLatency", () => {
  it("measures a known sample delay at both rates", async () => {
    const report = await measureLatency(latent(512, 512));
    expect(report.declared).toBe(512);
    expect(report.runs.map((r) => r.firstArrival)).toEqual([512, 512]);
  });

  it("reports peak for smeared responses", async () => {
    const report = await measureLatency(latent(100, 100));
    expect(report.runs[0].peak).toBeGreaterThanOrEqual(report.runs[0].firstArrival);
  });

  it("destroys each processor it builds", async () => {
    const destroyed: number[] = [];
    await measureLatency((ctx) => {
      const p = latent(64, 64)(ctx);
      const original = p.destroy.bind(p);
      p.destroy = () => {
        destroyed.push(ctx.sampleRate);
        original();
      };
      return p;
    });
    expect(destroyed).toEqual([44100, 48000]);
  });

  it("a waveshaper measures 0", async () => {
    const report = await measureLatency((ctx) => {
      class Shaper extends AudioProcessor {
        private readonly n: WaveShaperNode;
        constructor() {
          const curve = new Float32Array([-0.5, 0, 0.5]);
          const n = new WaveShaperNode(ctx, { curve });
          super(ctx, () => ({}));
          this.n = n;
        }
        override get input() {
          return this.n;
        }
        get output() {
          return this.n;
        }
      }
      return new Shaper();
    });
    expect(report.runs.every((r) => r.firstArrival === 0)).toBe(true);
  });
});

describe("assertLatency", () => {
  it("passes a correct samples declaration", async () => {
    await expect(assertLatency(latent(512, 512))).resolves.toBeUndefined();
  });

  it("fails a wrong declaration and suggests samples", async () => {
    await expect(assertLatency(latent(512, 502))).rejects.toThrow(/latency: 512/);
  });

  it("passes a correct time-based declaration", async () => {
    const tenMs = (rate: number) => Math.round(0.01 * rate);
    await expect(assertLatency(latent(tenMs, tenMs))).resolves.toBeUndefined();
  });

  it("fails a time-based latency declared as a literal, suggesting seconds", async () => {
    const tenMs = (rate: number) => Math.round(0.01 * rate);
    await expect(assertLatency(latent(tenMs, 441))).rejects.toThrow(/Math\.round\(0\.01 \* ctx\.sampleRate\)/);
  });

  it("a compensated composite passes with tolerance 0", async () => {
    await expect(assertLatency((ctx) => new Wet(ctx), { tolerance: 0 })).resolves.toBeUndefined();
  });

  it("fits neither model when runs disagree beyond both constant and scaling tolerance", async () => {
    // 100 samples @44100 and 700 samples @48000 fit neither a constant-samples
    // nor a rate-scaling model, so neither branch of formatMismatch applies.
    const uneven = latent((rate) => (rate === 48000 ? 700 : 100), 100);
    await expect(assertLatency(uneven)).rejects.toThrow(/fits neither a samples nor a time model/);
    await expect(assertLatency(uneven)).rejects.not.toThrow(/latency:/);
  });
});
