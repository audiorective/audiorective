import { AudioProcessor, Param } from "@audiorective/core";
import SignalsmithStretch, { type StretchNode } from "signalsmith-stretch";
import type { StretchOptions } from "../PitchShift";

/** Signalsmith Stretch in live-input mode. Silent until `ready`; latency is read from the node. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class StretchShifter extends AudioProcessor<{}, {}> {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  readonly ready: Promise<void>;
  private node: StretchNode | null = null;
  private pitch: number;
  private readonly opts: StretchOptions;
  private destroyed = false;

  constructor(ctx: BaseAudioContext, pitch: number, opts: StretchOptions = {}) {
    const input = new GainNode(ctx),
      output = new GainNode(ctx);
    const latency = new Param<number>({ default: 0 });
    super(ctx, () => ({ params: {}, cells: {}, latency }));
    this._input = input;
    this._output = output;
    this.pitch = pitch;
    this.opts = opts;

    this.ready = SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }).then(async (node) => {
      // Every remote method (configure/schedule/start/latency) is a message round-trip to the worklet thread,
      // resolving once the worklet has applied it — awaiting each keeps rendering from starting before it has.
      // `destroy()` can land between any two of those awaits, so each step re-checks the flag: before the node
      // is adopted it is stopped here; after adoption `destroy()` has already stopped it, and the only thing
      // left to avoid is `start()` reviving a node that was stopped underneath us.
      if (this.destroyed) return void node.stop();
      if (opts.blockMs !== undefined) await node.configure({ blockMs: opts.blockMs });
      if (this.destroyed) return void node.stop();
      input.connect(node);
      node.connect(output);
      this.node = node;
      await this.apply();
      if (this.destroyed) return;
      await node.start();
      if (this.destroyed) return void node.stop();
      const seconds = await node.latency();
      if (this.destroyed) return;
      latency.value = Math.round(seconds * ctx.sampleRate);
    });
  }

  override get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }

  private apply() {
    // `schedule` structured-clones this object as-is; a key present with value `undefined`
    // overwrites the worklet's own default rather than leaving it alone, so omit unset options.
    return this.node?.schedule({
      semitones: this.pitch,
      ...(this.opts.tonalityHz !== undefined && { tonalityHz: this.opts.tonalityHz }),
      ...(this.opts.formantSemitones !== undefined && { formantSemitones: this.opts.formantSemitones }),
      ...(this.opts.formantCompensation !== undefined && { formantCompensation: this.opts.formantCompensation }),
    });
  }

  setPitch(semitones: number): void {
    this.pitch = semitones;
    this.apply();
  }

  override destroy(): void {
    this.destroyed = true;
    if (this.node) {
      // The Signalsmith node exposes no dispose API; stop() halts its WASM work.
      this.node.stop();
      this.node.disconnect();
      this.node = null;
    }
    this.latency.destroy();
    super.destroy();
  }
}
