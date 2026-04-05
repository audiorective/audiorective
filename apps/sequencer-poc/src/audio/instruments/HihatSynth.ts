import { AudioProcessor } from "@audiorective/core";
import { createNoiseBuffer } from "./noiseBuffer";

export class HihatSynth extends AudioProcessor {
  private readonly noiseBuffer: AudioBuffer;
  private readonly masterGain: GainNode;

  readonly volume;
  readonly decay;
  readonly tone;

  constructor(context: AudioContext) {
    super(context);

    this.masterGain = context.createGain();
    this.noiseBuffer = createNoiseBuffer(context, 0.6);

    this.volume = this.param({ default: 0.6, label: "Volume", min: 0, max: 1 });
    this.decay = this.param({ default: 0.05, label: "Decay", min: 0.02, max: 0.6, step: 0.005, display: (v) => `${(v * 1000).toFixed(0)} ms` });
    this.tone = this.param({ default: 0.5, label: "Tone", min: 0, max: 1 }); // HPF cutoff 4k–18k Hz
  }

  get output(): AudioNode {
    return this.masterGain;
  }

  play(time: number): void {
    const vol = this.volume.value;
    const decay = this.decay.value;
    const toneVal = this.tone.value;

    // HPF cutoff: 0 → 4000 Hz, 1 → 18000 Hz
    const hpfFreq = 4000 + toneVal * 14000;

    const noiseSource = this.context.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const hpf = this.context.createBiquadFilter();
    hpf.type = "highpass";
    hpf.frequency.value = hpfFreq;
    hpf.Q.value = 0.5;

    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(0, time);
    noiseGain.gain.linearRampToValueAtTime(vol, time + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    noiseSource.connect(hpf);
    hpf.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(time);
    noiseSource.stop(time + decay + 0.02);
  }

  // HihatSynth uses per-hit nodes, so silence is a no-op
  // (in-flight nodes will finish their own envelope)
  silence(): void {}
}
