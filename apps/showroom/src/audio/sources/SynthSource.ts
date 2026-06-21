import { StepSynth } from "../instruments/StepSynth";
import type { MasterSequencer } from "../MasterSequencer";

const A4 = 440;
const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A1", "C#2", "Eb3" → frequency in Hz (scientific pitch, A4 = 440). Falls back to A2. */
export function noteToFreq(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) return 110;
  let semis = SEMITONES[m[1].toUpperCase()];
  if (m[2] === "#") semis += 1;
  else if (m[2] === "b") semis -= 1;
  const midi = semis + (parseInt(m[3], 10) + 1) * 12; // C-1 → MIDI 0
  return A4 * Math.pow(2, (midi - 69) / 12);
}

// Placeholder bassline until the user supplies real notes (see config.json audio.bass).
const DEFAULT_BASS_NOTES = ["E1", "E1", "G1", "A1"];

/**
 * The Bass channel's source: a StepSynth voiced as a bass, playing a looping note
 * sequence on the shared transport (one note every other step). Notes are
 * swappable via setNotes (wired to config.json `audio.bass.notes`).
 */
export class SynthSource {
  readonly synth: StepSynth;
  private notes: number[] = DEFAULT_BASS_NOTES.map(noteToFreq);

  constructor(ctx: AudioContext, transport: MasterSequencer) {
    this.synth = new StepSynth(ctx);
    // Bass voice: saw through a low cutoff with a bit of sustain.
    this.synth.params.waveform.value = "sawtooth";
    this.synth.params.cutoff.value = 600;
    this.synth.params.decay.value = 0.35;

    transport.register(
      (step, time) => {
        if (step % 2 === 0) {
          const i = (step / 2) % this.notes.length;
          this.synth.playNote(this.notes[i], time);
        }
      },
      () => this.synth.silence(),
    );
  }

  get output(): AudioNode | undefined {
    return this.synth.output;
  }

  /** Replace the bass note sequence (note names, e.g. ["A1","A1","E2"]). */
  setNotes(noteNames: string[]): void {
    if (noteNames.length > 0) this.notes = noteNames.map(noteToFreq);
  }

  destroy(): void {
    this.synth.destroy();
  }
}
