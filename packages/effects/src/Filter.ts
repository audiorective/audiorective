import type { Param, SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";

export interface FilterOptions extends EffectOptions {
  frequency?: number;
  type?: BiquadFilterType;
  Q?: number;
  gain?: number;
  /** dB per octave; one biquad per 12 dB in series. Default -12. */
  rolloff?: -12 | -24 | -48;
}

export class Filter extends Effect<{ frequency: SchedulableParam; Q: SchedulableParam; gain: SchedulableParam; type: Param<BiquadFilterType> }> {
  private readonly sources: ConstantSourceNode[];

  constructor(ctx: BaseAudioContext, opts: FilterOptions = {}) {
    const stageCount = Math.abs(opts.rolloff ?? -12) / 12;
    const type = opts.type ?? "lowpass";
    const stages = Array.from({ length: stageCount }, () => new BiquadFilterNode(ctx, { type }));
    for (let i = 1; i < stages.length; i++) stages[i - 1]!.connect(stages[i]!);

    const freq = fanout(
      ctx,
      opts.frequency ?? 350,
      stages.map((s) => s.frequency),
    );
    const q = fanout(
      ctx,
      opts.Q ?? 1,
      stages.map((s) => s.Q),
    );
    const gain = fanout(
      ctx,
      opts.gain ?? 0,
      stages.map((s) => s.gain),
    );

    super(
      ctx,
      { input: stages[0]!, output: stages[stages.length - 1]! },
      ({ param }) => ({
        params: {
          frequency: param({ default: opts.frequency ?? 350, bind: freq.offset, min: 10, max: 22050 }),
          Q: param({ default: opts.Q ?? 1, bind: q.offset, min: 0.0001, max: 1000 }),
          gain: param({ default: opts.gain ?? 0, bind: gain.offset, min: -40, max: 40 }),
          type: param<BiquadFilterType>({
            default: type,
            bind: {
              set: (t) =>
                stages.forEach((s) => {
                  s.type = t;
                }),
            },
          }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    this.sources = [freq, q, gain];
  }

  override destroy(): void {
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    super.destroy();
  }
}
