import { AudioProcessor, Param } from "@audiorective/core";
import SignalsmithStretch, { type StretchNode } from "signalsmith-stretch";
import type { StretchOptions } from "../PitchShift";

/** Signalsmith Stretch in live-input mode. Silent until `ready`; latency is read from the node. */
export class StretchShifter extends AudioProcessor {
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
    super(ctx, () => ({ latency }));
    this._input = input;
    this._output = output;
    this.pitch = pitch;
    this.opts = opts;

    this.ready = SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }).then(async (node) => {
      if (this.destroyed) return;
      // Every remote method (configure/schedule/start/latency) is a message round-trip to the worklet thread,
      // resolving once the worklet has applied it — awaiting each keeps rendering from starting before it has.
      if (opts.blockMs !== undefined) await node.configure({ blockMs: opts.blockMs });
      input.connect(node);
      node.connect(output);
      this.node = node;
      await this.apply();
      await node.start();
      latency.value = Math.round((await node.latency()) * ctx.sampleRate);
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
      this.node.stop();
      this.node.disconnect();
    }
    this.latency.destroy();
    super.destroy();
  }
}
