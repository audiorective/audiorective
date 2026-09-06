import { describe, expect, it } from "vitest";
import { AudioProcessor, defineGraph } from "../src";
import type { GraphHandle } from "../src";

// A processor that really delays by N samples AND declares it — the stand-in
// for a buffering effect (a worklet, a lookahead limiter).
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

// Same idea as FakeLatent, but input and output are distinct nodes wired internally by a
// plain .connect() — the stand-in for a composite processor (in ≠ out) whose own internal
// path isn't a wire in whatever graph it's used in.
class FakeLatentDistinct extends AudioProcessor {
  private readonly inGain: GainNode;
  private readonly delay: DelayNode;
  constructor(ctx: BaseAudioContext, samples: number) {
    const inGain = new GainNode(ctx);
    const delay = new DelayNode(ctx, { delayTime: samples / ctx.sampleRate, maxDelayTime: 1 });
    super(ctx, () => ({ latency: samples }));
    inGain.connect(delay);
    this.inGain = inGain;
    this.delay = delay;
  }
  override get input() {
    return this.inGain;
  }
  get output() {
    return this.delay;
  }
}

// Renders `seconds` through an OfflineAudioContext after `wire` runs; returns channel 0.
async function render(seconds: number, wire: (ctx: OfflineAudioContext) => void): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100);
  wire(ctx);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

function dirac(ctx: BaseAudioContext): AudioBufferSourceNode {
  const buffer = new AudioBuffer({ length: 1, sampleRate: ctx.sampleRate });
  buffer.getChannelData(0)[0] = 1;
  const src = new AudioBufferSourceNode(ctx, { buffer });
  src.start(0);
  return src;
}

const firstArrival = (data: Float32Array, threshold = 1e-4) => data.findIndex((v) => Math.abs(v) > threshold);

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

describe("latency compensation", () => {
  it("aligns a two-branch join to the slower branch", async () => {
    const N = 500;
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const split = new GainNode(ctx);
      const slow = new FakeLatent(ctx, N);
      const fast = new GainNode(ctx); // 0-latency branch
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, split],
          [split, slow],
          [slow, join],
          [split, fast],
          [fast, join],
          [join, ctx.destination],
        ],
        { context: ctx },
      );
    });
    // Both copies of the impulse land on the same sample: one peak, at N.
    expect(firstArrival(data)).toBe(N);
    expect(data.slice(0, N).every((v) => Math.abs(v) < 1e-4)).toBe(true);
  });

  it("compensate:false leaves branches misaligned", async () => {
    const N = 500;
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const split = new GainNode(ctx);
      const slow = new FakeLatent(ctx, N);
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, split],
          [split, slow],
          [slow, join],
          [split, join],
          [join, ctx.destination],
        ],
        { context: ctx, compensate: false },
      );
    });
    expect(firstArrival(data)).toBe(0); // dry branch arrives immediately
  });

  it("derives owner latency: serial sum, parallel max", async () => {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const wet = new Wet(ctx);
    expect(wet.latency.value).toBe(300);
    expect(wet.declaredLatency).toBe(false);
  });

  it("a nested processor contributes its single latency to the parent join", async () => {
    // Wet (300, from Wet's class above) on one branch, dry on the other:
    // parent aligns to 300.
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const split = new GainNode(ctx);
      const wet = new Wet(ctx);
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, split],
          [split, wet],
          [wet, join],
          [split, join],
          [join, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(300);
  });

  it("re-solves when a declared latency Param changes", async () => {
    const ctx = new AudioContext();
    const slow = new FakeLatent(ctx, 100);
    const join = new GainNode(ctx);
    const dry = new GainNode(ctx);
    const src = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow],
        [slow, join],
        [src, dry],
        [dry, join],
        [join, ctx.destination],
      ],
      { context: ctx },
    );
    expect(handle.arrivalOf(join)).toBe(100);
    slow.latency.value = 250;
    expect(handle.arrivalOf(join)).toBe(250);
  });

  it("chains latency across a distinct-in/out processor's invisible internal path", async () => {
    // Two 300-sample processors in series, each with input !== output: the parent
    // graph never sees a wire between either processor's own input and output, so
    // the arrival at the end must still accumulate both — 600, not 300.
    class SerialOwner extends AudioProcessor {
      constructor(ctx: BaseAudioContext) {
        const inGain = new GainNode(ctx);
        const outGain = new GainNode(ctx);
        super(ctx, () => ({}));
        const a = new FakeLatentDistinct(ctx, 300);
        const b = new FakeLatentDistinct(ctx, 300);
        this._in = inGain;
        this._out = outGain;
        this.defineGraph(() => [
          [inGain, a],
          [a, b],
          [b, outGain],
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
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const owner = new SerialOwner(ctx);
    expect(owner.latency.value).toBe(600);
  });

  it("aligns a join across a chain of distinct-in/out processors", async () => {
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const slow = new FakeLatentDistinct(ctx, 500);
      const wetLike = new FakeLatentDistinct(ctx, 300);
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, slow],
          [slow, wetLike],
          [wetLike, join],
          [src, join], // dry branch
          [join, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(800);
    expect(data.slice(0, 800).every((v) => Math.abs(v) < 1e-4)).toBe(true);
  });

  it("keeps a processor's internal edge forward when it sits in an external feedback loop", async () => {
    // proc's own input→output path is a virtual edge; [fbDelay, proc] is a real external
    // feedback edge back into the same node (proc.input). The virtual edge must never be
    // the one excluded as the back-edge — that's the feedback wire's job — or proc's own
    // latency would stop propagating to `join` and the feedback wire would wrongly count
    // as forward. The edges are ordered so `proc.output` is discovered before
    // `proc.input` — the ordering that makes back-edge detection close the cycle onto the
    // virtual edge if it isn't excluded from that detection.
    const N = 300;
    const captured: { handle?: GraphHandle; join?: GainNode } = {};
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const proc = new FakeLatentDistinct(ctx, N);
      const join = new GainNode(ctx);
      const fbDelay = new DelayNode(ctx, { delayTime: 0.05 });
      captured.join = join;
      captured.handle = defineGraph(
        () => [
          [proc, fbDelay],
          [fbDelay, proc], // external feedback loop around proc
          [src, proc],
          [proc, join],
          [join, ctx.destination],
        ],
        { context: ctx },
      );
    });
    // Renders without stalling or throwing, and proc's own latency still reaches `join`.
    expect(captured.handle!.arrivalOf(captured.join!)).toBe(N);
    expect(firstArrival(data)).toBe(N);
    expect(data.slice(0, N).every((v) => Math.abs(v) < 1e-4)).toBe(true);
  });

  it("excludes back-edges from latency", async () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const loopIn = new GainNode(ctx);
    const fb = new DelayNode(ctx, { delayTime: 0.1 });
    const handle = defineGraph(
      () => [
        [src, loopIn],
        [loopIn, fb],
        [fb, loopIn], // cycle
        [loopIn, ctx.destination],
      ],
      { context: ctx },
    );
    expect(handle.arrivalOf(loopIn)).toBe(0);
  });
});
