import { AudioProcessor, type BuildHelpers, type BuildResult, type Param, type SchedulableParam } from "@audiorective/core";

// Registry constraints mirror core's (invariant Param<T>/Cell<T> need `any`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParamRegistry = Record<string, Param<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellRegistry = Record<string, import("@audiorective/core").Cell<any>>;

export interface WetArm {
  input: AudioNode | AudioProcessor;
  output: AudioNode | AudioProcessor;
}

export interface EffectOptions {
  /** Initial wet mix 0..1. Default 1. */
  wet?: number;
}

/**
 * Base for every effect: stable `input`/`output` gains and a linear wet/dry
 * crossfade. `wet` is one automation signal that drives the wet gain directly
 * and the dry gain as `1 − wet`, so ramps land sample-accurately on both arms.
 * The graph is compensated, so a latent wet arm delays the dry arm to match and
 * the effect's own latency (when not declared) derives to the wet arm's.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export abstract class Effect<P extends ParamRegistry = {}, C extends CellRegistry = {}> extends AudioProcessor<P & { wet: SchedulableParam }, C> {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  private readonly _sources: ConstantSourceNode[];

  protected constructor(
    ctx: BaseAudioContext,
    arm: WetArm,
    build: (h: BuildHelpers) => { params: P; cells: C; latency?: number | Param<number> },
    opts: EffectOptions = {},
  ) {
    const input = new GainNode(ctx);
    const output = new GainNode(ctx);
    const dry = new GainNode(ctx, { gain: 0 }); // driven by 1 − wet
    const wetGain = new GainNode(ctx, { gain: 0 }); // driven by wet
    const one = new ConstantSourceNode(ctx, { offset: 1 });
    const negate = new GainNode(ctx, { gain: -1 });
    const wetSignal = new ConstantSourceNode(ctx, { offset: opts.wet ?? 1 });
    one.start();
    wetSignal.start();

    super(ctx, (h) => {
      const built = build(h);
      const wet = h.param({ default: opts.wet ?? 1, bind: wetSignal.offset, min: 0, max: 1 });
      const result: { params: P & { wet: SchedulableParam }; cells: C; latency?: number | Param<number> } = {
        params: { ...built.params, wet },
        cells: built.cells,
      };
      if (built.latency !== undefined) result.latency = built.latency;
      return result as unknown as BuildResult<P & { wet: SchedulableParam }, C>;
    });

    this._input = input;
    this._output = output;

    // `arm.input` may be an AudioProcessor; as a sink it must resolve to a concrete
    // node here (the processor itself still appears as the `arm.output` source below,
    // so its latency still flows into the graph).
    const armInput = arm.input instanceof AudioProcessor ? arm.input.input : arm.input;
    if (!armInput) throw new Error("Effect: wet arm's input processor has no input node");

    this.defineGraph(
      () => [
        [input, dry],
        [dry, output],
        [input, armInput],
        [arm.output, wetGain],
        [wetGain, output],
        [wetSignal, wetGain.gain],
        [wetSignal, negate],
        [negate, dry.gain],
        [one, dry.gain],
      ],
      { compensate: true },
    );

    this._sources = [one, wetSignal];
  }

  override get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }

  override destroy(): void {
    for (const s of this._sources) {
      s.stop();
      s.disconnect();
    }
    super.destroy();
  }
}
