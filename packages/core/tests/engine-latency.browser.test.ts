import { describe, expect, it } from "vitest";
import { AudioProcessor, LatencyUnknownError, createEngine } from "../src";

// Same class as in graph-latency.browser.test.ts.
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
  readonly branchA: FakeLatent;
  constructor(ctx: BaseAudioContext) {
    const inGain = new GainNode(ctx);
    const outGain = new GainNode(ctx);
    super(ctx, () => ({}));
    const a = new FakeLatent(ctx, 100);
    const b = new FakeLatent(ctx, 300);
    this._in = inGain;
    this._out = outGain;
    this.branchA = a;
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

describe("engine latency queries", () => {
  const make = () =>
    createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      const dry = new FakeLatent(ctx, 0);
      defineGraph(() => [
        [slow, ctx.destination],
        [dry, ctx.destination],
      ]);
      return { slow, dry };
    });

  it("latency is the longest path into the destination", () => {
    const engine = make();
    expect(engine.core.latency.value).toBe(400);
  });

  it("perceivedTime = currentTime + latency seconds + outputLatency", () => {
    const engine = make();
    const ctx = engine.core.context;
    const expected = ctx.currentTime + 400 / ctx.sampleRate + (ctx.outputLatency ?? 0);
    expect(engine.core.perceivedTime).toBeCloseTo(expected, 3);
  });

  it("getPathLatency: compensated paths all equal the max", () => {
    const engine = make();
    expect(engine.core.getPathLatency(engine.slow)).toBe(0); // 400 total − 400 own arrival
    expect(engine.core.getPathLatency(engine.dry)).toBe(400); // dry path carries the comp delay
  });

  it("getPathLatency recurses through a nested processor's graph", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const wet = new Wet(ctx);
      defineGraph(() => [[wet, ctx.destination]]);
      return { wet, inner: wet.branchA };
    });
    // inner branch A: compensated to 300 inside Wet, plus 0 from Wet to destination
    expect(engine.core.getPathLatency(engine.inner)).toBe(200);
  });

  it("throws LatencyUnknownError for an untracked processor", () => {
    const engine = make();
    const stray = new FakeLatent(engine.core.context, 5); // never placed in a graph
    expect(() => engine.core.getPathLatency(stray)).toThrow(LatencyUnknownError);
  });

  it("no root graph → latency 0", () => {
    const engine = createEngine(() => ({}));
    expect(engine.core.latency.value).toBe(0);
  });

  it("latency is the max across multiple engine-owned graphs, unaffected by a smaller graph re-solving", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      const dry = new FakeLatent(ctx, 0);
      defineGraph(() => [[slow, ctx.destination]]);
      defineGraph(() => [[dry, ctx.destination]]);
      return { slow, dry };
    });
    expect(engine.core.latency.value).toBe(400);

    // Re-solving the smaller graph must not clobber the 400-sample path still
    // connected in the other graph.
    engine.dry.latency.value = 50;
    expect(engine.core.latency.value).toBe(400);
  });
});
