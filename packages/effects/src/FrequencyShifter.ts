import type { SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";
import { phasedWave } from "./internal/lfo";

export interface FrequencyShifterOptions extends EffectOptions {
  /** Shift in Hz; negative selects the lower sideband. Default 0. */
  frequency?: number;
}

// Olli Niemitalo's Hilbert-transformer allpass coefficients (Tone.js `PhaseShiftAllpass`):
// bank0 gives the 90°-lagging branch (paired with a one-sample delay), bank1 the 180° branch.
const BANK_90 = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737];
const BANK_180 = [0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278];

function allpassChain(ctx: BaseAudioContext, coefficients: number[]): { input: AudioNode; output: AudioNode } {
  const sections = coefficients.map((a) => ctx.createIIRFilter([a * a, 0, -1], [1, 0, -(a * a)]));
  for (let i = 1; i < sections.length; i++) sections[i - 1]!.connect(sections[i]!);
  return { input: sections[0]!, output: sections[sections.length - 1]! };
}

/**
 * Single-sideband shifter: a Hilbert transform splits the input into two
 * quadrature branches, each modulated by a cosine/sine at the shift frequency
 * and summed, cancelling one sideband. A negative `frequency` flips the sine's
 * sign and so selects the lower sideband instead of the upper.
 */
export class FrequencyShifter extends Effect<{ frequency: SchedulableParam }> {
  private readonly oscillators: OscillatorNode[];
  private readonly freqSource: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, opts: FrequencyShifterOptions = {}) {
    const entry = new GainNode(ctx);
    const b90 = allpassChain(ctx, BANK_90);
    const oneSample = ctx.createIIRFilter([0, 1], [1, 0]);
    const b180 = allpassChain(ctx, BANK_180);
    entry.connect(b90.input);
    b90.output.connect(oneSample);
    entry.connect(b180.input);

    const sine = new OscillatorNode(ctx, { frequency: 0 });
    const cosine = new OscillatorNode(ctx, { frequency: 0, periodicWave: phasedWave(ctx, "sine", 90) });
    const mulCos = new GainNode(ctx, { gain: 0 });
    const mulSin = new GainNode(ctx, { gain: 0 });
    const negate = new GainNode(ctx, { gain: -1 });
    const sum = new GainNode(ctx);
    b180.output.connect(mulCos);
    cosine.connect(mulCos.gain);
    mulCos.connect(sum);
    oneSample.connect(mulSin);
    sine.connect(mulSin.gain);
    mulSin.connect(negate);
    negate.connect(sum);

    const freq = fanout(ctx, opts.frequency ?? 0, [sine.frequency, cosine.frequency]);

    super(
      ctx,
      { input: entry, output: sum },
      ({ param }) => ({
        params: { frequency: param({ default: opts.frequency ?? 0, bind: freq.offset, min: -5000, max: 5000 }) },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    sine.start();
    cosine.start();
    this.oscillators = [sine, cosine];
    this.freqSource = freq;
  }

  override destroy(): void {
    for (const o of this.oscillators) {
      o.stop();
      o.disconnect();
    }
    this.freqSource.stop();
    this.freqSource.disconnect();
    super.destroy();
  }
}
