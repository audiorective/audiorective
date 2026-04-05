import { AudioProcessor } from "@audiorective/core";
import { createNoiseBuffer } from "./noiseBuffer";

export class SnareSynth extends AudioProcessor {
  private readonly osc: OscillatorNode;
  private readonly oscGain: GainNode;
  private readonly masterGain: GainNode;
  private readonly noiseBuffer: AudioBuffer;

  readonly volume;
  readonly pitch;
  readonly decay;
  readonly snap;
  readonly noiseMix;

  constructor(context: AudioContext) {
    super(context);

    this.osc = context.createOscillator();
    this.oscGain = context.createGain();
    this.masterGain = context.createGain();

    this.osc.type = "triangle";
    this.oscGain.gain.value = 0;

    this.osc.connect(this.oscGain);
    this.oscGain.connect(this.masterGain);
    this.osc.start();

    this.noiseBuffer = createNoiseBuffer(context, 0.5);

    this.volume = this.param({ default: 0.7, label: "Volume", min: 0, max: 1 });
    this.pitch = this.param({ default: 200, label: "Pitch", min: 100, max: 400, step: 1, display: (v) => `${Math.round(v)} Hz` });
    this.decay = this.param({ default: 0.12, label: "Decay", min: 0.05, max: 0.3, step: 0.005, display: (v) => `${(v * 1000).toFixed(0)} ms` });
    this.snap = this.param({ default: 0.6, label: "Snap", min: 0, max: 1 });
    this.noiseMix = this.param({ default: 0.7, label: "Noise Mix", min: 0, max: 1 });
  }

  get output(): AudioNode {
    return this.masterGain;
  }

  play(time: number): void {
    const vol = this.volume.value;
    const pitch = this.pitch.value;
    const decay = this.decay.value;
    const snap = this.snap.value;
    const noiseMixAmt = this.noiseMix.value;

    // Tone oscillator envelope
    this.osc.frequency.setValueAtTime(pitch, time);
    this.oscGain.gain.cancelScheduledValues(time);
    this.oscGain.gain.setValueAtTime(0, time);
    this.oscGain.gain.linearRampToValueAtTime(vol * (1 - noiseMixAmt), time + 0.002);
    this.oscGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    // Noise layer — fresh chain per hit
    if (noiseMixAmt > 0.01) {
      // snap controls attack: high snap = fast attack, low = slower
      const attackTime = 0.001 + (1 - snap) * 0.025;
      const noiseSource = this.context.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      const noiseGain = this.context.createGain();
      const noiseFilter = this.context.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 2000;
      noiseFilter.Q.value = 0.8;

      noiseGain.gain.setValueAtTime(0, time);
      noiseGain.gain.linearRampToValueAtTime(vol * noiseMixAmt, time + attackTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

      noiseSource.connect(noiseGain);
      noiseGain.connect(noiseFilter);
      noiseFilter.connect(this.masterGain);
      noiseSource.start(time);
      noiseSource.stop(time + decay + 0.05);
    }
  }

  silence(): void {
    const now = this.context.currentTime;
    this.oscGain.gain.cancelScheduledValues(now);
    this.oscGain.gain.setValueAtTime(0, now);
  }
}
