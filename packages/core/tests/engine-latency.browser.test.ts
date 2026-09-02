import { describe, expect, it } from "vitest";
import { AudioProcessor, LatencyUnknownError, Param, createEngine } from "../src";
import type { GraphHandle } from "../src";

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

  it("drops a graph's contribution when it disconnects from the destination", () => {
    const connected = new Param<boolean>({ default: true });
    const engine = createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      defineGraph(() => [connected.value && [slow, ctx.destination]]);
      return { slow };
    });
    expect(engine.core.latency.value).toBe(400);
    connected.value = false;
    expect(engine.core.latency.value).toBe(0);
  });

  it("getPathLatency throws LatencyUnknownError after a conditional edge removes the processor", () => {
    const on = new Param<boolean>({ default: true });
    const engine = createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      defineGraph(() => [on.value && [slow, ctx.destination]]);
      return { slow };
    });
    expect(engine.core.getPathLatency(engine.slow)).toBe(0);
    on.value = false;
    expect(() => engine.core.getPathLatency(engine.slow)).toThrow(LatencyUnknownError);
  });

  it("getPathLatency throws LatencyUnknownError after the owning graph is disposed", () => {
    let handle!: GraphHandle;
    const engine = createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      handle = defineGraph(() => [[slow, ctx.destination]]);
      return { slow };
    });
    handle.dispose();
    expect(() => engine.core.getPathLatency(engine.slow)).toThrow(LatencyUnknownError);
  });

  it("getPathLatency resolves through a processor's other graph after one graph disposes", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const shared = new FakeLatent(ctx, 400);
      const dry = new FakeLatent(ctx, 0);
      const handleA = defineGraph(() => [[shared, ctx.destination]]);
      defineGraph(() => [
        [shared, dry],
        [dry, ctx.destination],
      ]);
      return { shared, dry, handleA };
    });
    expect(engine.core.getPathLatency(engine.shared)).toBe(0); // handleA: direct to destination
    engine.handleA.dispose();
    expect(engine.core.getPathLatency(engine.shared)).toBe(0); // the other graph still reaches destination through dry
  });

  it("getPathLatency stays resolvable after a conditional edge drops the processor from one of its two graphs", () => {
    const on = new Param<boolean>({ default: true });
    const engine = createEngine((ctx, { defineGraph }) => {
      const shared = new FakeLatent(ctx, 400);
      const dry = new FakeLatent(ctx, 0);
      defineGraph(() => [on.value && [shared, ctx.destination]]);
      defineGraph(() => [
        [shared, dry],
        [dry, ctx.destination],
      ]);
      return { shared, dry };
    });
    expect(engine.core.getPathLatency(engine.shared)).toBe(0);
    on.value = false;
    expect(engine.core.getPathLatency(engine.shared)).toBe(0);
  });

  it("getPathLatency throws once a processor's last graph is gone", () => {
    const on = new Param<boolean>({ default: true });
    const engine = createEngine((ctx, { defineGraph }) => {
      const shared = new FakeLatent(ctx, 400);
      const dry = new FakeLatent(ctx, 0);
      const handleA = defineGraph(() => [[shared, ctx.destination]]);
      defineGraph(() => [on.value && [shared, dry], [dry, ctx.destination]]);
      return { shared, dry, handleA };
    });
    expect(engine.core.getPathLatency(engine.shared)).toBe(0);
    engine.handleA.dispose();
    on.value = false;
    expect(() => engine.core.getPathLatency(engine.shared)).toThrow(LatencyUnknownError);
  });

  it("destroy() after a graph disposes doesn't double-dispose or throw", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      const handle = defineGraph(() => [[slow, ctx.destination]]);
      return { slow, handle };
    });
    engine.handle.dispose();
    // A disposed handle is spliced out of the engine's own graph list, so
    // destroy() must not try to dispose it again.
    expect(() => engine.core.destroy()).not.toThrow();
  });

  it("disposing the same graph handle twice is harmless", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      const handle = defineGraph(() => [[slow, ctx.destination]]);
      return { slow, handle };
    });
    engine.handle.dispose();
    expect(() => engine.handle.dispose()).not.toThrow();
    expect(engine.core.latency.value).toBe(0);
  });

  it("getPathLatency throws LatencyUnknownError for a processor that only feeds an AudioParam", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const lfo = new FakeLatent(ctx, 0);
      const carrier = new GainNode(ctx);
      defineGraph(() => [
        [lfo, carrier.gain],
        [carrier, ctx.destination],
      ]);
      return { lfo };
    });
    expect(() => engine.core.getPathLatency(engine.lfo)).toThrow(LatencyUnknownError);
  });
});
