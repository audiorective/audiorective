import { AudioProcessor, Param, SchedulableParam } from "@audiorective/core";

type Waveform = "sine" | "square" | "sawtooth" | "triangle";

export class StepSynth extends AudioProcessor<{
  waveform: Param<Waveform>;
  volume: Param<number>;
  cutoff: SchedulableParam;
  resonance: SchedulableParam;
  attack: Param<number>;
  decay: Param<number>;
}> {
  private readonly osc: OscillatorNode;
  private readonly gain: GainNode;

  constructor(context: AudioContext) {
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();

    osc.type = "sawtooth";
    filter.type = "lowpass";
    gain.gain.value = 0;

    osc.connect(filter);
    filter.connect(gain);
    osc.start();

    super(context, ({ param }) => ({
      params: {
        waveform: param<Waveform>({
          default: "sawtooth",
          label: "Waveform",
          bind: {
            get: () => osc.type as Waveform,
            set: (v) => {
              osc.type = v;
            },
          },
        }),
        volume: param({ default: 0.5, label: "Volume", min: 0, max: 1 }),
        cutoff: param({
          default: 2000,
          label: "Cutoff",
          min: 20,
          max: 20000,
          step: 1,
          display: (v) => `${Math.round(v)} Hz`,
          bind: filter.frequency,
        }),
        resonance: param({ default: 1, label: "Resonance", min: 0.1, max: 30, step: 0.1, bind: filter.Q }),
        attack: param({ default: 0.01, label: "Attack", min: 0.001, max: 1, step: 0.001, display: (v) => `${(v * 1000).toFixed(0)} ms` }),
        decay: param({ default: 0.2, label: "Decay", min: 0.01, max: 2, step: 0.01, display: (v) => `${(v * 1000).toFixed(0)} ms` }),
      },
    }));

    this.osc = osc;
    this.gain = gain;
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
    const currentCutoff = this.params.cutoff.value;
    this.params.cutoff.setValueAtTime(currentCutoff, now);
    this.params.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.params.cutoff.linearRampToValueAtTime(currentCutoff, now + duration);
  }

  playNote(frequency: number, time: number): void {
    const atk = this.params.attack.value;
    const dec = this.params.decay.value;
    const vol = this.params.volume.value;

    this.osc.frequency.setValueAtTime(frequency, time);
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setValueAtTime(0, time);
    this.gain.gain.linearRampToValueAtTime(vol, time + atk);
    this.gain.gain.linearRampToValueAtTime(0, time + atk + dec);
  }
}
