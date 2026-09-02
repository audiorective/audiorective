import { describe, expect, it } from "vitest";
import { AudioProcessor, Param, defineGraph } from "../src";

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

describe("defineGraph wiring", () => {
  it("connects declared edges", async () => {
    const data = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      const gain = new GainNode(ctx);
      defineGraph(
        () => [
          [src, gain],
          [gain, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(0);
  });

  it("rewires reactively on signal change", async () => {
    // gate=false drops the src→destination edge; render twice around a flip.
    const gate = new Param<boolean>({ default: false });
    const silent = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      defineGraph(() => [gate.value && [src, ctx.destination]], { context: ctx });
    });
    expect(firstArrival(silent)).toBe(-1);

    gate.value = true;
    const audible = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      defineGraph(() => [gate.value && [src, ctx.destination]], { context: ctx });
    });
    expect(firstArrival(audible)).toBe(0);
  });

  it("connects through a processor's input/output", async () => {
    class PassThrough extends AudioProcessor {
      private readonly gain: GainNode;
      constructor(ctx: BaseAudioContext) {
        const gain = new GainNode(ctx);
        super(ctx, () => ({}));
        this.gain = gain;
      }
      override get input() {
        return this.gain;
      }
      get output() {
        return this.gain;
      }
    }
    const data = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      const proc = new PassThrough(ctx);
      defineGraph(
        () => [
          [src, proc],
          [proc, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(0);
  });

  it("connects an AudioParam sink", async () => {
    const data = await render(0.01, (ctx) => {
      const mod = dirac(ctx);
      const carrier = new ConstantSourceNode(ctx, { offset: 0 });
      carrier.start(0);
      defineGraph(
        () => [
          [mod, carrier.offset], // impulse into the offset AudioParam
          [carrier, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(0); // param modulation is audible at sample 0
  });

  it("dispose() disconnects everything", async () => {
    const data = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      const handle = defineGraph(() => [[src, ctx.destination]], { context: ctx });
      handle.dispose();
    });
    expect(firstArrival(data)).toBe(-1);
  });

  it("rejects a bare AudioWorkletNode at runtime", () => {
    const ctx = new AudioContext();
    const fake = Object.create(AudioWorkletNode.prototype) as AudioWorkletNode;
    expect(() => defineGraph(() => [[fake, ctx.destination]], { context: ctx })).toThrow(/AudioWorkletNode/);
  });
});
