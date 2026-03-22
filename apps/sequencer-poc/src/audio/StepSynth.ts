import { AudioProcessor } from "@audiorective/signals";

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
      label: "Waveform",
      bind: {
        get: (self) => self.osc.type as Waveform,
        set: (self, val) => {
          self.osc.type = val;
        },
      },
    });

    this.volume = this.param({
      default: 0.5,
      min: 0,
      max: 1,
      label: "Volume",
      bind: (self) => self.gain.gain,
    });

    this.cutoff = this.param({
      default: 2000,
      min: 20,
      max: 20000,
      label: "Cutoff",
      unit: "Hz",
      bind: (self) => self.filter.frequency,
    });

    this.resonance = this.param({
      default: 1,
      min: 0.1,
      max: 30,
      label: "Resonance",
      bind: (self) => self.filter.Q,
    });

    this.attack = this.param({ default: 0.01, min: 0.001, max: 1, label: "Attack", unit: "s" });
    this.decay = this.param({ default: 0.2, min: 0.01, max: 2, label: "Decay", unit: "s" });
  }

  get output(): AudioNode {
    return this.gain;
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
    console.log("play note", frequency, time, dec, vol);
  }
}
