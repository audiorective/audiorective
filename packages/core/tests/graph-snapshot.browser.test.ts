import { describe, expect, it } from "vitest";
import { AudioProcessor, defineGraph } from "../src";

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

// input and output differ, so this processor gets a virtual edge in the solve.
class SplitProcessor extends AudioProcessor {
  readonly inNode: GainNode;
  readonly outNode: GainNode;
  constructor(ctx: BaseAudioContext) {
    const inNode = new GainNode(ctx);
    const outNode = new GainNode(ctx);
    super(ctx, () => ({ latency: 0 }));
    inNode.connect(outNode);
    this.inNode = inNode;
    this.outNode = outNode;
  }
  override get input() {
    return this.inNode;
  }
  get output() {
    return this.outNode;
  }
}

describe("GraphHandle.snapshot", () => {
  it("reports nodes, edges and the compensating delay of a two-branch join", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const slow = new FakeLatent(ctx, 500);
    const join = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow, { label: "wet" }],
        [slow, join],
        [src, join, { label: "dry" }],
        [join, ctx.destination],
      ],
      { context: ctx },
    );
    const snap = handle.snapshot();
    const slowNode = snap.nodes.find((n) => n.kind === "processor")!;
    expect(slowNode.label).toBe("FakeLatent");
    expect(slowNode.latency).toBe(500);
    const dry = snap.edges.find((e) => e.label === "dry")!;
    expect(dry.kind).toBe("audio");
    expect(dry.compensationSamples).toBe(500);
    expect(snap.edges.filter((e) => e.compensationSamples > 0)).toHaveLength(1);
    const joinNode = snap.nodes.find((n) => n.id === dry.to)!;
    expect(joinNode.arrival).toBe(500);
  });

  it("bumps solveId and updates compensation on a latency change", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const slow = new FakeLatent(ctx, 100);
    const join = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow],
        [slow, join],
        [src, join, { label: "dry" }],
        [join, ctx.destination],
      ],
      { context: ctx },
    );
    const before = handle.snapshot();
    slow.latency.value = 250;
    const after = handle.snapshot();
    expect(after.solveId).toBeGreaterThan(before.solveId);
    expect(after.edges.find((e) => e.label === "dry")!.compensationSamples).toBe(250);
  });

  it("compensate:false reports zero compensation everywhere", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const slow = new FakeLatent(ctx, 100);
    const join = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow],
        [slow, join],
        [src, join],
        [join, ctx.destination],
      ],
      { context: ctx, compensate: false },
    );
    expect(handle.snapshot().edges.every((e) => e.compensationSamples === 0)).toBe(true);
  });

  it("reports virtual and back edge kinds in a feedback topology", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const proc = new FakeLatent(ctx, 50);
    const fb = new DelayNode(ctx, { delayTime: 0.1 });
    const handle = defineGraph(
      () => [
        [src, proc],
        [proc, fb],
        [fb, proc],
        [proc, ctx.destination],
      ],
      { context: ctx },
    );
    const kinds = new Set(handle.snapshot().edges.map((e) => e.kind));
    expect(kinds.has("back")).toBe(true);
    // a processor whose input and output are the same node has no virtual edge; use distinct nodes:
    const split = new SplitProcessor(ctx);
    const handle2 = defineGraph(
      () => [
        [src, split],
        [split, ctx.destination],
      ],
      { context: ctx },
    );
    const kinds2 = new Set(handle2.snapshot().edges.map((e) => e.kind));
    expect(kinds2.has("virtual")).toBe(true);
  });

  it("reports a param edge", () => {
    const ctx = new AudioContext();
    const lfo = new OscillatorNode(ctx);
    const carrier = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [lfo, carrier.gain],
        [carrier, ctx.destination],
      ],
      { context: ctx },
    );
    expect(handle.snapshot().edges.some((e) => e.kind === "param")).toBe(true);
  });
});
