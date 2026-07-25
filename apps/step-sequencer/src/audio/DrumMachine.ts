import { AudioProcessor, Cell, Param, Sampler } from "@audiorective/core";
import { Clock, LinearBarRuler, Timeline } from "@audiorective/clock";
import type { TickSource, TimeSource } from "@audiorective/clock";
import type { DrumKit, DrumVoiceId } from "./drumKit";
import { STEPS_PER_BAR } from "./stepFromBar";

type SequencerRulers = { bar: LinearBarRuler };

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
   * Where the Timeline reads "now". Defaults to `audioContext` — the whole
   * point of the clock's structural TimeSource is that a test can hand it a
   * plain `{ currentTime }` it advances by hand, while audio nodes keep the
   * real context they need.
   */
  timeSource?: TimeSource;
  /** Injected by tests (ManualTickSource); production uses the Clock default. */
  tickSource?: TickSource;
  /** Test hook: fires alongside every scheduled trigger. */
  onStepScheduled?: (trackId: DrumVoiceId, step: number, time: number) => void;
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

function patternFromSteps(steps: number[]): boolean[] {
  const pattern = Array<boolean>(STEPS_PER_BAR).fill(false);
  for (const step of steps) pattern[step] = true;
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
 * The whole scheduling story is the `onTick` handler below: iterate the bar
 * ruler's 16th-note grid, look the step up with `index % 16`, trigger. There
 * are no cursors and nothing to reset on a transport jump, because `index` is
 * derived from position rather than counted.
 */
export class DrumMachine extends AudioProcessor {
  readonly tracks: readonly DrumTrack[];

  private readonly _master: GainNode;
  private readonly _timeline: Timeline<SequencerRulers>;
  private readonly _clock: Clock<SequencerRulers>;

  constructor(options: DrumMachineOptions) {
    const { audioContext, kit, bpm = 120, timeSource, tickSource, onStepScheduled } = options;
    // No params/cells registry: the reactive surface is per-track (`pattern`,
    // `mute` on each DrumTrack) plus `bpm`/`state`, which belong to the
    // Timeline and Clock respectively.
    super(audioContext, () => ({}));

    // Not connected to `destination` here -- the caller wires `output`, so the
    // machine can be routed through an EQ, reverb, or mixer like any processor.
    this._master = new GainNode(audioContext, { gain: 0.8 });

    const ids: DrumVoiceId[] = ["kick", "snare", "hat", "clap"];
    this.tracks = ids.map((id) => {
      // polyphony > 1 so a fast pattern's tail isn't cut off by its own next hit
      const sampler = new Sampler(audioContext, { buffer: kit[id], polyphony: 4 });
      sampler.output.connect(this._master);
      return {
        id,
        label: TRACK_LABELS[id],
        sampler,
        pattern: new Cell(patternFromSteps(DEFAULT_PATTERNS[id])),
        mute: new Param<boolean>({ default: false, label: `${TRACK_LABELS[id]} mute` }),
      };
    });

    this._timeline = new Timeline({ audioContext: timeSource ?? audioContext, bpm }).addRuler(
      "bar",
      new LinearBarRuler({ numerator: 4, denominator: 4 }),
    );

    this._clock = new Clock({
      timeline: this._timeline,
      tickSource,
      onTick: (window) => {
        for (const { time, index } of window.rulers.bar.grid(STEPS_PER_BAR)) {
          const step = index % STEPS_PER_BAR;
          for (const track of this.tracks) {
            if (track.mute.value) continue;
            if (!track.pattern.value[step]) continue;
            track.sampler.trigger({ when: time });
            onStepScheduled?.(track.id, step, time);
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

  /** Reactive bar-ruler reading at the playhead — drives the step highlight. */
  get currentBar() {
    return this._timeline.rulers.bar.current;
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
