import { StepSynth } from "../../examples/sequencer/audio/instruments/StepSynth";
import type { MasterSequencer } from "../../examples/sequencer/audio/MasterSequencer";

// Semitone offsets of a simple looping arpeggio over a base note.
const ARP = [0, 7, 12, 7];
const BASE_HZ = 220; // A3

function noteFor(step: number): number {
  const idx = Math.floor(step / 2) % ARP.length;
  return BASE_HZ * Math.pow(2, ARP[idx] / 12);
}

/** The Synth channel's source: a StepSynth playing an arp on the shared transport. */
export class SynthSource {
  readonly synth: StepSynth;

  constructor(ctx: AudioContext, transport: MasterSequencer) {
    this.synth = new StepSynth(ctx);
    transport.register(
      (step, time) => {
        if (step % 2 === 0) this.synth.playNote(noteFor(step), time);
      },
      () => this.synth.silence(),
    );
  }

  get output(): AudioNode | undefined {
    return this.synth.output;
  }

  destroy(): void {
    this.synth.destroy();
  }
}
