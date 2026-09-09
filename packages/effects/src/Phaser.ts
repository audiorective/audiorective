import type { Param, SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";
import { Lfo } from "./internal/lfo";

export interface PhaserOptions extends EffectOptions {
  /** LFO rate, Hz. Default 0.5. */
  frequency?: number;
  /** Sweep range above `baseFrequency`, in octaves. Default 3. */
  octaves?: number;
  /** Bottom of the sweep range, Hz. Default 350. */
  baseFrequency?: number;
  /** Allpass Q, shared by every stage. Default 10. */
  Q?: number;
  /** Allpass stages per channel. Default 10. */
  stages?: number;
}

/**
 * The wet arm sums the input with the phased signal at equal gain, which is what produces the
 * notches; `wet` blends between the dry input and that phased mix.
 */
export class Phaser extends Effect<{ frequency: SchedulableParam; Q: SchedulableParam; octaves: Param<number>; baseFrequency: Param<number> }> {
  private readonly lfo: Lfo;
  private readonly qSource: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, opts: PhaserOptions = {}) {
    const stages = opts.stages ?? 10;
    const base = opts.baseFrequency ?? 350;
    const octaves = opts.octaves ?? 3;
    const entry = new GainNode(ctx, { channelCount: 2, channelCountMode: "explicit" });
    const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    const sum = new GainNode(ctx);
    const dryTap = new GainNode(ctx, { gain: 0.5 });
    const wetTap = new GainNode(ctx, { gain: 0.5 });
    entry.connect(splitter);
    entry.connect(dryTap);
    dryTap.connect(sum);
    merger.connect(wetTap);
    wetTap.connect(sum);
    const all: BiquadFilterNode[] = [];
    for (let ch = 0; ch < 2; ch++) {
      const chain = Array.from({ length: stages }, () => new BiquadFilterNode(ctx, { type: "allpass" }));
      for (let i = 1; i < chain.length; i++) chain[i - 1]!.connect(chain[i]!);
      splitter.connect(chain[0]!, ch);
      chain[chain.length - 1]!.connect(merger, 0, ch);
      all.push(...chain);
    }
    const lfo = new Lfo(ctx, { shape: "sine", frequency: opts.frequency ?? 0.5, min: base, max: base * 2 ** octaves });
    for (const f of all) lfo.connect(f.frequency);
    const q = fanout(
      ctx,
      opts.Q ?? 10,
      all.map((f) => f.Q),
    );

    let currentBase = base;
    let currentOctaves = octaves;
    const retune = () => lfo.setRange(currentBase, currentBase * 2 ** currentOctaves);

    super(
      ctx,
      { input: entry, output: sum },
      ({ param }) => ({
        params: {
          frequency: param({ default: opts.frequency ?? 0.5, bind: lfo.frequency, min: 0, max: 20 }),
          Q: param({ default: opts.Q ?? 10, bind: q.offset, min: 0.1, max: 100 }),
          octaves: param<number>({
            default: octaves,
            min: 0,
            max: 10,
            bind: {
              set: (v) => {
                currentOctaves = v;
                retune();
              },
            },
          }),
          baseFrequency: param<number>({
            default: base,
            min: 20,
            max: 10000,
            bind: {
              set: (v) => {
                currentBase = v;
                retune();
              },
            },
          }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    lfo.start();
    this.lfo = lfo;
    this.qSource = q;
  }

  override destroy(): void {
    this.lfo.disconnect();
    this.qSource.stop();
    this.qSource.disconnect();
    super.destroy();
  }
}
