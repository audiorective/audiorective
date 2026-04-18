import type { AudioProcessor, Spatial } from "@audiorective/core";
import type { TrackSequencer } from "./TrackSequencer";
import type { DrumSequencer } from "./DrumSequencer";

// Note frequency tables
const PAD_NOTE_FREQS: Record<string, number> = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
};

const BASS_NOTE_FREQS: Record<string, number> = {
  C1: 32.7,
  D1: 36.71,
  E1: 41.2,
  F1: 43.65,
  G1: 49.0,
  A1: 55.0,
  B1: 61.74,
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  B2: 123.47,
  C3: 130.81,
};

const ALL_FREQS = { ...BASS_NOTE_FREQS, ...PAD_NOTE_FREQS };

export const PAD_NOTES = Object.keys(PAD_NOTE_FREQS);
export const BASS_NOTES = Object.keys(BASS_NOTE_FREQS);

export const noteToFreq = (note: string): number => ALL_FREQS[note] ?? 440;

export const freqToNote = (freq: number, notes: string[]): string => {
  let closest = notes[0];
  let minDiff = Infinity;
  for (const note of notes) {
    const diff = Math.abs(noteToFreq(note) - freq);
    if (diff < minDiff) {
      minDiff = diff;
      closest = note;
    }
  }
  return closest;
};

export type Instrument = {
  synth: AudioProcessor;
  notes?: string[]; // present for melodic instruments
};

export type Track = {
  id: string;
  label: string;
  color: string;
  seq: TrackSequencer | DrumSequencer;
  instrument: Instrument;
  spatial: Spatial;
};
