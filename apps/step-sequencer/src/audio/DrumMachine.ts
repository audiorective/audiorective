import { AudioProcessor, Cell, Param, Sampler } from "@audiorective/core";
import { Clock, CycleBarRuler, LinearBarRuler, Timeline } from "@audiorective/clock";
import type { DrumKit, DrumVoiceId } from "./drumKit";
import { DEFAULT_PATTERN_LENGTH, STEPS_PER_BAR } from "./stepFromPattern";

/**
 * Two rulers, two questions, one timeline — rulers are stateless, so stacking
 * them costs nothing:
 *
 * - `pattern` is the scheduling coordinate. Its cycle length *is* the pattern
 *   length, so a grid point's `step` indexes the pattern array directly.
 * - `bar` is the display coordinate: absolute bars counted forever, for the
 *   `bar : beat` readout, which a cycling ruler deliberately can't give.
 */
type SequencerRulers = { bar: LinearBarRuler; pattern: CycleBarRuler };

export interface DrumTrack {
  readonly id: DrumVoiceId;
  readonly label: string;
  readonly sampler: Sampler;
  readonly pattern: Cell<boolean[]>;
  readonly mute: Param<boolean>;
}

export interface DrumMachineOptions {
  audioContext: AudioContext;
  kit: DrumKit;
  bpm?: number;
  /**
   * Steps in one pass of the pattern. Drives both the cycle ruler's division
   * and the pattern array length, so the two can't drift apart — a 32 here
   * gives a two-bar pattern with no other change.
   */
  patternLength?: number;
}

const TRACK_LABELS: Record<DrumVoiceId, string> = {
  kick: "Kick",
  snare: "Snare",
  hat: "Hat",
  clap: "Clap",
};

/** Four-on-the-floor kick, backbeat snare, offbeat hats — legible on press-play. */
const DEFAULT_PATTERNS: Record<DrumVoiceId, number[]> = {
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
  clap: [],
};

function patternFromSteps(steps: number[], length: number): boolean[] {
  const pattern = Array<boolean>(length).fill(false);
  for (const step of steps) if (step < length) pattern[step] = true;
  return pattern;
}

/**
 * The headless audio core: owns the Timeline, the Clock, and one Sampler per
 * track. No DOM, no framework — runs entirely inside a unit test.
 *
 * Sits on both of the system's axes (see `docs/architecture.md`): an
 * `AudioProcessor` on the space axis — it owns the master gain and four
 * samplers, and exposes `output` — that consumes a `Clock` on the time axis.
 * Holding a clock is the point; reimplementing one would be the error.
 *
 * The whole scheduling story is the `onTick` handler below: iterate the
 * pattern ruler's grid and trigger. No cursors, no modulo, nothing to reset on
 * a transport jump — `step` is derived from position rather than counted, and
 * the ruler folds it into the cycle before handing it over.
 */
export class DrumMachine extends AudioProcessor {
  readonly tracks: readonly DrumTrack[];
  /** Steps in one pass — the cycle ruler's division and the pattern length. */
  readonly patternLength: number;

  private readonly _master: GainNode;
  private readonly _timeline: Timeline<SequencerRulers>;
  private readonly _clock: Clock<SequencerRulers>;

  constructor(options: DrumMachineOptions) {
    const { audioContext, kit, bpm = 120, patternLength = DEFAULT_PATTERN_LENGTH } = options;
    // No params/cells registry: the reactive surface is per-track (`pattern`,
    // `mute` on each DrumTrack) plus `bpm`/`state`, which belong to the
    // Timeline and Clock respectively.
    super(audioContext, () => ({}));

    // Not connected to `destination` here -- the caller wires `output`, so the
    // machine can be routed through an EQ, reverb, or mixer like any processor.
    this._master = new GainNode(audioContext, { gain: 0.8 });
    this.patternLength = patternLength;

    const ids: DrumVoiceId[] = ["kick", "snare", "hat", "clap"];
    this.tracks = ids.map((id) => {
      // polyphony > 1 so a fast pattern's tail isn't cut off by its own next hit
      const sampler = new Sampler(audioContext, { buffer: kit[id], polyphony: 4 });
      sampler.output.connect(this._master);
      return {
        id,
        label: TRACK_LABELS[id],
        sampler,
        pattern: new Cell(patternFromSteps(DEFAULT_PATTERNS[id], patternLength)),
        mute: new Param<boolean>({ default: false, label: `${TRACK_LABELS[id]} mute` }),
      };
    });

    // Steps are sixteenths, so the pattern spans `patternLength / STEPS_PER_BAR`
    // bars -- 16 steps is one bar, 32 is two. The cycle region therefore holds
    // exactly one pass of the pattern, which is what makes a grid point's
    // `step` a direct index into it.
    this._timeline = new Timeline({ audioContext, bpm })
      .addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }))
      .addRuler("pattern", new CycleBarRuler({ numerator: 4, denominator: 4, bars: patternLength / STEPS_PER_BAR }));

    this._clock = new Clock({
      timeline: this._timeline,
      onTick: (window) => {
        // `step` is already folded into the cycle, so it indexes the pattern
        // directly -- and it stays in range across the loop wrap and any seek.
        for (const { time, step } of window.rulers.pattern.grid(patternLength)) {
          for (const track of this.tracks) {
            if (track.mute.value) continue;
            if (!track.pattern.value[step]) continue;
            track.sampler.trigger({ when: time });
          }
        }
      },
    });
  }

  get output(): AudioNode {
    return this._master;
  }

  /** Live tempo (a Param — bind a slider straight to `.value`). */
  get bpm() {
    return this._timeline.bpm;
  }

  /** Reactive transport state, for button labels/disabled states. */
  get state() {
    return this._clock.state;
  }

  /** Reactive bar-ruler reading at the playhead — drives the `bar : beat` readout. */
  get currentBar() {
    return this._timeline.rulers.bar.current;
  }

  /** Reactive pattern-ruler reading at the playhead — drives the step highlight. */
  get currentPattern() {
    return this._timeline.rulers.pattern.current;
  }

  toggleStep(trackId: DrumVoiceId, step: number): void {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    track.pattern.update((draft) => {
      draft[step] = !draft[step];
    });
  }

  /** Play from a stop, or resume from a pause — whichever the state calls for. */
  play(): void {
    if (this._clock.state.value === "paused") this._clock.resume();
    else this._clock.start();
  }

  pause(): void {
    this._clock.pause();
  }

  stop(): void {
    this._clock.stop();
    for (const track of this.tracks) track.sampler.stopAll();
  }

  destroy(): void {
    this._clock.destroy();
    for (const track of this.tracks) track.sampler.destroy();
    this._master.disconnect();
    super.destroy();
  }
}
