/**
 * Console UI — drives the same audio engine from the browser DevTools console.
 * Demonstrates UI/audio separation: no DOM, no React, same engine.
 *
 * Available on window as `seq`
 */
import { engine } from "./audio/engine";
import { noteToFreq, freqToNote, PAD_NOTES, BASS_NOTES, type Track } from "./audio/trackConfig";
import { TrackSequencer } from "./audio/TrackSequencer";

// ─── Track proxies ─────────────────────────────────────────────────────────

type SynthNoteArray = (string | null | undefined)[];
type DrumNoteArray = (number | boolean | null | undefined)[];

interface SynthTrackHandle {
  get notes(): SynthNoteArray;
  set notes(arr: SynthNoteArray);
}

interface DrumTrackHandle {
  get notes(): DrumNoteArray;
  set notes(arr: DrumNoteArray);
}

function makeSynthHandle(track: Track & { seq: TrackSequencer }): SynthTrackHandle {
  const trackNotes = track.instrument.notes!;
  return {
    get notes(): SynthNoteArray {
      return (track.seq.steps.value as Array<{ active: boolean; frequency: number }>).map((s) =>
        s.active ? freqToNote(s.frequency, trackNotes) : null,
      );
    },
    set notes(arr: SynthNoteArray) {
      arr.slice(0, 8).forEach((note, i) => {
        const step = (track.seq.steps.value as Array<{ active: boolean }>)[i];
        if (note == null) {
          if (step?.active) track.seq.toggleStep(i);
        } else {
          track.seq.setStepNote(i, noteToFreq(note));
          if (!step?.active) track.seq.toggleStep(i);
        }
      });
    },
  };
}

function makeDrumHandle(track: Track): DrumTrackHandle {
  return {
    get notes(): DrumNoteArray {
      return (track.seq.steps.value as Array<{ active: boolean }>).map((s) => (s.active ? 1 : 0));
    },
    set notes(arr: DrumNoteArray) {
      arr.slice(0, 8).forEach((val, i) => {
        const step = (track.seq.steps.value as Array<{ active: boolean }>)[i];
        const want = Boolean(val);
        if (step && step.active !== want) track.seq.toggleStep(i);
      });
    },
  };
}

function buildTracks(): Record<string, SynthTrackHandle | DrumTrackHandle> {
  const result: Record<string, SynthTrackHandle | DrumTrackHandle> = {};
  for (const track of engine.tracks) {
    const handle = track.seq instanceof TrackSequencer ? makeSynthHandle(track as Track & { seq: TrackSequencer }) : makeDrumHandle(track);
    result[track.id] = Object.freeze(handle); // prevents deleting/replacing `notes`
  }
  return Object.freeze(result); // prevents seq.tracks.kick = something
}

// ─── status() ──────────────────────────────────────────────────────────────

function status(): void {
  const { masterSeq, tracks } = engine;
  const bpm = Math.round(masterSeq.bpm.value);
  const playing = masterSeq.playing.value;

  console.log(`%c${playing ? "▶" : "■"} BPM: ${bpm}`, "color: #aaa; font-family: monospace");

  for (const track of tracks) {
    const steps = track.seq.steps.value as Array<{ active: boolean; frequency?: number }>;
    const trackNotes = track.instrument.notes ?? null;

    const cells = steps.map((s) => {
      if (!s.active) return "·";
      return trackNotes && s.frequency !== undefined ? freqToNote(s.frequency, trackNotes) : "◆";
    });

    console.log(
      `%c${track.label.padEnd(6)}%c${cells.join("  ")}`,
      `color: ${track.color}; font-family: monospace; font-weight: bold`,
      "color: #888; font-family: monospace",
    );
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

const seq = {
  play: () => engine.masterSeq.start(),
  stop: () => engine.masterSeq.stop(),
  get bpm() {
    return engine.masterSeq.bpm.value;
  },
  set bpm(v: number) {
    engine.masterSeq.bpm.value = v;
  },
  rampBpm: (target: number, duration = 4) => engine.masterSeq.rampBpm(target, duration),

  tracks: buildTracks(),

  /** Toggle a single step. e.g. seq.toggle("kick", 0) */
  toggle: (trackId: string, step: number) => {
    const track = engine.tracks.find((t) => t.id === trackId);
    if (!track) {
      console.error(`Unknown track: ${trackId}. Options: pad bass kick snare hihat`);
      return;
    }
    track.seq.toggleStep(step);
  },

  /** Set the note for a single synth step. e.g. seq.note("pad", 0, "G4") */
  note: (trackId: string, step: number, noteName: string) => {
    const track = engine.tracks.find((t) => t.id === trackId);
    if (!track || !(track.seq instanceof TrackSequencer)) {
      console.error("Not a synth track");
      return;
    }
    const allNotes = [...PAD_NOTES, ...BASS_NOTES];
    if (!allNotes.includes(noteName)) {
      console.error(`Unknown note: ${noteName}`);
      return;
    }
    track.seq.setStepNote(step, noteToFreq(noteName));
  },

  /** Set a synth parameter. e.g. seq.param("kick", "pitch", 60) */
  param: (trackId: string, paramName: string, value: number) => {
    const track = engine.tracks.find((t) => t.id === trackId);
    if (!track) {
      console.error(`Unknown track: ${trackId}`);
      return;
    }
    const p = track.instrument.synth.getParameter(paramName);
    if (!p) {
      console.error(`Unknown param: ${paramName}`);
      return;
    }
    p.value = value;
  },

  status,
};

declare global {
  interface Window {
    seq: typeof seq;
  }
}

window.seq = Object.freeze(seq); // prevents seq.play = something, seq.tracks = something

console.info(
  "%c[seq] Console API ready. Try: seq.play()  seq.tracks.kick.notes = [1,0,1,0,1,0,1,0]  seq.status()",
  "color: #4ade80; font-family: monospace",
);
