import { AudioProcessor } from "@audiorective/core";

type Waveform = "sine" | "square" | "sawtooth" | "triangle";

export class StepSynth extends AudioProcessor {
  private readonly osc: OscillatorNode;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;

  readonly waveform;
  readonly volume;
  readonly cutoff;
  readonly resonance;
  readonly attack;
  readonly decay;

  constructor(context: AudioContext) {
    super(context);

    this.osc = context.createOscillator();
    this.filter = context.createBiquadFilter();
    this.gain = context.createGain();

    this.osc.type = "sawtooth";
    this.filter.type = "lowpass";
    this.gain.gain.value = 0;

    this.osc.connect(this.filter);
    this.filter.connect(this.gain);
    this.osc.start();

    this.waveform = this.param<Waveform>({
      default: "sawtooth",
      bind: {
        get: () => this.osc.type as Waveform,
        set: (v) => {
          this.osc.type = v;
        },
      },
    });

    this.volume = this.param({ default: 0.5 });
    this.cutoff = this.param({ default: 2000, bind: this.filter.frequency });
    this.resonance = this.param({ default: 1, bind: this.filter.Q });
    this.attack = this.param({ default: 0.01 });
    this.decay = this.param({ default: 0.2 });
  }

  get output(): AudioNode {
    return this.gain;
  }

  silence(): void {
    const now = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(0, now);
  }

  filterSweep(peakFreq = 18000, duration = 2): void {
    const now = this.context.currentTime;
    const currentCutoff = this.cutoff.value;
    this.cutoff.setValueAtTime(currentCutoff, now);
    this.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.cutoff.linearRampToValueAtTime(currentCutoff, now + duration);
  }

  playNote(frequency: number, time: number): void {
    const atk = this.attack.value;
    const dec = this.decay.value;
    const vol = this.volume.value;

    this.osc.frequency.setValueAtTime(frequency, time);
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setValueAtTime(0, time);
    this.gain.gain.linearRampToValueAtTime(vol, time + atk);
    this.gain.gain.linearRampToValueAtTime(0, time + atk + dec);
  }
}
