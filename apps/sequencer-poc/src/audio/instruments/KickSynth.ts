import { AudioProcessor } from "@audiorective/core";
import { createNoiseBuffer } from "./noiseBuffer";

export class KickSynth extends AudioProcessor {
  private readonly osc: OscillatorNode;
  private readonly oscGain: GainNode;
  private readonly masterGain: GainNode;
  private readonly noiseBuffer: AudioBuffer;

  readonly volume;
  readonly pitch;
  readonly decay;
  readonly punch;
  readonly tone;

  constructor(context: AudioContext) {
    super(context);

    this.osc = context.createOscillator();
    this.oscGain = context.createGain();
    this.masterGain = context.createGain();

    this.osc.type = "sine";
    this.oscGain.gain.value = 0;

    this.osc.connect(this.oscGain);
    this.oscGain.connect(this.masterGain);
    this.osc.start();

    this.noiseBuffer = createNoiseBuffer(context, 0.05);

    this.volume = this.param({ default: 0.8, label: "Volume", min: 0, max: 1 });
    this.pitch = this.param({ default: 55, label: "Pitch", min: 40, max: 120, step: 1, display: (v) => `${Math.round(v)} Hz` });
    this.decay = this.param({ default: 0.3, label: "Decay", min: 0.05, max: 0.5, step: 0.01, display: (v) => `${(v * 1000).toFixed(0)} ms` });
    this.punch = this.param({ default: 4, label: "Punch", min: 1, max: 8, step: 0.1 });
    this.tone = this.param({ default: 0.3, label: "Tone", min: 0, max: 1 });
  }

  get output(): AudioNode {
    return this.masterGain;
  }

  play(time: number): void {
    const vol = this.volume.value;
    const pitch = this.pitch.value;
    const decay = this.decay.value;
    const punch = this.punch.value;
    const toneAmt = this.tone.value;

    // Frequency sweep: pitch*punch → pitch over first 40% of decay
    this.osc.frequency.cancelScheduledValues(time);
    this.osc.frequency.setValueAtTime(pitch * punch, time);
    this.osc.frequency.exponentialRampToValueAtTime(Math.max(pitch, 20), time + decay * 0.4);

    // Amplitude envelope
    this.oscGain.gain.cancelScheduledValues(time);
    this.oscGain.gain.setValueAtTime(0, time);
    this.oscGain.gain.linearRampToValueAtTime(vol, time + 0.005);
    this.oscGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    // Transient noise click
    if (toneAmt > 0.01) {
      const noiseSource = this.context.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      const noiseGain = this.context.createGain();
      noiseGain.gain.setValueAtTime(0, time);
      noiseGain.gain.linearRampToValueAtTime(vol * toneAmt * 0.5, time + 0.002);
      noiseGain.gain.linearRampToValueAtTime(0, time + 0.025);
      noiseSource.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noiseSource.start(time);
      noiseSource.stop(time + 0.05);
    }
  }

  silence(): void {
    const now = this.context.currentTime;
    this.oscGain.gain.cancelScheduledValues(now);
    this.oscGain.gain.setValueAtTime(0, now);
  }
}
