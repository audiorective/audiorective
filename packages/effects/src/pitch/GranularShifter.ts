import { AudioProcessor } from "@audiorective/core";
import { fanout } from "../internal/fanout";
import { Lfo } from "../internal/lfo";

export interface GranularShifterOptions {
  pitch?: number;
  windowSize?: number;
}

/** Two delay lines swept by out-of-phase sawtooths and crossfaded — Tone.js's PitchShift core. */
export class GranularShifter extends AudioProcessor {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  private readonly windowSize: number;
  private readonly lfoA: Lfo;
  private readonly lfoB: Lfo;
  private readonly fade: Lfo;
  private readonly rate: ConstantSourceNode;
  private readonly one: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, opts: GranularShifterOptions = {}) {
    const windowSize = opts.windowSize ?? 0.1;
    const input = new GainNode(ctx),
      output = new GainNode(ctx);
    const delayA = new DelayNode(ctx, { maxDelayTime: 1 }),
      delayB = new DelayNode(ctx, { maxDelayTime: 1 });
    const gainA = new GainNode(ctx, { gain: 0 }),
      gainB = new GainNode(ctx, { gain: 0 });
    const one = new ConstantSourceNode(ctx, { offset: 1 });
    const invert = new GainNode(ctx, { gain: -1 });
    input.connect(delayA);
    input.connect(delayB);
    delayA.connect(gainA);
    delayB.connect(gainB);
    gainA.connect(output);
    gainB.connect(output);

    const lfoA = new Lfo(ctx, { shape: "sawtooth", frequency: 0, min: 0, max: windowSize });
    const lfoB = new Lfo(ctx, { shape: "sawtooth", phaseDeg: 180, frequency: 0, min: 0, max: windowSize });
    const fade = new Lfo(ctx, { shape: "triangle", phaseDeg: 90, frequency: 0, min: 0, max: 1 });
    lfoA.connect(delayA.delayTime);
    lfoB.connect(delayB.delayTime);
    fade.connect(gainA.gain);
    // gainB = 1 − fade: the fade signal through a −1 gain, summed with a constant 1
    fade.connectNode(invert);
    invert.connect(gainB.gain);
    one.connect(gainB.gain);
    const rate = fanout(ctx, 0, [lfoA.frequency, lfoB.frequency, fade.frequency]);

    super(ctx, () => ({ latency: Math.round(windowSize * ctx.sampleRate) }));
    this._input = input;
    this._output = output;
    this.windowSize = windowSize;
    this.lfoA = lfoA;
    this.lfoB = lfoB;
    this.fade = fade;
    this.rate = rate;
    this.one = one;
    one.start();
    lfoA.start();
    lfoB.start();
    fade.start();
    this.setPitch(opts.pitch ?? 0);
  }

  override get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }

  setPitch(semitones: number): void {
    let factor: number;
    if (semitones < 0) {
      this.lfoA.setRange(0, this.windowSize);
      this.lfoB.setRange(0, this.windowSize);
      factor = 2 ** ((semitones - 1) / 12) + 1;
    } else {
      this.lfoA.setRange(this.windowSize, 0);
      this.lfoB.setRange(this.windowSize, 0);
      factor = 2 ** (semitones / 12) - 1;
    }
    this.rate.offset.value = (factor * 1.2) / this.windowSize;
  }

  override destroy(): void {
    for (const l of [this.lfoA, this.lfoB, this.fade]) l.disconnect();
    this.rate.stop();
    this.rate.disconnect();
    this.one.stop();
    this.one.disconnect();
    super.destroy();
  }
}
