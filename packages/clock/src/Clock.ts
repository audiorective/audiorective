import { Param } from "@audiorective/core";
import type { Timeline } from "./Timeline";
import type { Ruler } from "./rulers/Ruler";
import { WorkerTickSource } from "./TickSource";
import type { TickSource } from "./TickSource";
import type { CoreTickWindow, TransportState } from "./types";

export interface MissedGap {
  gapStart: number;
  gapEnd: number;
  gapDuration: number;
}

export type TickWindow<TRulers extends Record<string, Ruler<unknown, unknown>>> = CoreTickWindow & {
  rulers: { [K in keyof TRulers]: TRulers[K] extends Ruler<infer TWin, unknown> ? TWin : never };
};

export interface ClockOptions<TRulers extends Record<string, Ruler<unknown, unknown>>> {
  timeline: Timeline<TRulers>;
  lookAhead?: number;
  tickInterval?: number;
  onTick: (window: TickWindow<TRulers>) => void;
  onMiss?: (gap: MissedGap) => void;
  tickSource?: TickSource;
}

/**
 * Owns the worker tick loop and the transport. Ticks run continuously from
 * construction (refreshing bpm/ruler `current` readings every tick) whether
 * or not the transport is playing; scheduling windows are only emitted
 * while playing.
 */
export class Clock<TRulers extends Record<string, Ruler<unknown, unknown>> = Record<never, never>> {
  readonly state: Param<TransportState>;

  private readonly _timeline: Timeline<TRulers>;
  private readonly _lookAhead: number;
  private readonly _onTick: (window: TickWindow<TRulers>) => void;
  private readonly _onMiss?: (gap: MissedGap) => void;
  private readonly _tickSource: TickSource;

  private _previousWindowEndBeat = 0;
  // The generation `_previousWindowEndBeat` belongs to. A fresh segment
  // (start/seek) has no prior emitted window to have fallen behind -- some
  // real time inevitably passes between anchoring the target beat and the
  // tick source's next callback, which would otherwise register as a
  // spurious one-tick miss on every single start/seek. Comparing generations
  // lets that first tick land exactly on the target beat with no false miss.
  private _previousWindowEndGeneration = -1;
  private _startedAt = 0;
  private _destroyed = false;

  constructor(options: ClockOptions<TRulers>) {
    this._timeline = options.timeline;
    this._lookAhead = options.lookAhead ?? 0.1;
    this._onTick = options.onTick;
    this._onMiss = options.onMiss;
    this._tickSource = options.tickSource ?? new WorkerTickSource((options.tickInterval ?? 0.025) * 1000);
    this.state = new Param<TransportState>({ default: "stopped" });
    this._tickSource.start(() => this._tick());
  }

  /**
   * Begins playback. Always a position jump (bumps `generation`): the
   * V1 tempo-automation caveat applies when `atBeat` lands on/after a
   * scheduled tempo event — see the clock design spec's ST-6.
   */
  start(options?: { atBeat?: number }): void {
    const atBeat = options?.atBeat ?? 0;
    this._timeline._start(atBeat);
    this._previousWindowEndBeat = atBeat;
    // deliberately NOT updating _previousWindowEndGeneration here: it must
    // stay stale (mismatching the just-bumped generation) so the first tick
    // recognizes this as a fresh segment and skips the miss check; _tick()
    // catches it up to the current generation once that tick has run.
    this._startedAt = this._timeline.now;
    this.state.value = "playing";
  }

  /**
   * Stops without resetting position. Committed look-ahead audio keeps
   * sounding — an accepted tail.
   *
   * A no-op unless the transport is playing. Pausing a *stopped* clock would
   * otherwise mint a resumable paused state that no `start()` ever anchored:
   * `stop()` resets `_previousWindowEndBeat` to 0 without bumping
   * `generation`, so the following `resume()` produces a segment the miss
   * check treats as continuous, and the first tick reports a spurious gap and
   * skips past beat 0 — dropping the events there.
   */
  pause(): void {
    if (this.state.value !== "playing") return;
    this._timeline._pause();
    this.state.value = "paused";
  }

  /**
   * Continues from the frozen position — not a position jump, `generation`
   * unchanged. A no-op unless the transport is paused, so a stray resume can't
   * rewind a running clock or start a stopped one (see `Timeline._resume`).
   */
  resume(): void {
    if (this.state.value !== "paused") return;
    this._timeline._resume();
    this.state.value = "playing";
  }

  /** Stops and resets position to beat 0. */
  stop(): void {
    this._timeline._stop();
    this._previousWindowEndBeat = 0;
    this.state.value = "stopped";
  }

  /** Jumps to `beat`. Bumps `generation`; the next window starts exactly at `beat` (beats may re-appear). */
  seek(beat: number): void {
    this._timeline._seek(beat);
    this._previousWindowEndBeat = beat;
    // see start(): _previousWindowEndGeneration deliberately stays stale here too
  }

  /** Stops the tick loop for good (terminates the underlying worker/timer). */
  destroy(): void {
    this._destroyed = true;
    this._tickSource.stop();
  }

  private _tick(): void {
    // a tick already in flight (posted by the worker before terminate())
    // can still arrive after destroy() -- ignore it
    if (this._destroyed) return;

    const now = this._timeline.now;

    // reactive surfaces refresh every tick regardless of transport state
    this._timeline.bpm._refresh(now);
    this._timeline._refreshRulerCurrents(now);

    if (this.state.value !== "playing") return;

    const generation = this._timeline.generation;
    const freshSegment = generation !== this._previousWindowEndGeneration;

    let startBeat = this._previousWindowEndBeat;
    const nowBeat = this._timeline.timeToBeat(now);
    if (!freshSegment && nowBeat > startBeat) {
      // the clock fired late; those beats are gone -- Web Audio cannot schedule into the past
      this._onMiss?.({
        gapStart: startBeat,
        gapEnd: nowBeat,
        gapDuration: now - this._timeline.beatToTime(startBeat),
      });
      startBeat = nowBeat;
    }

    const endBeat = this._timeline.timeToBeat(now + this._lookAhead);
    if (endBeat > startBeat) {
      const coreWindow: CoreTickWindow = {
        time: { started: this._startedAt, current: now, lookAheadEnd: now + this._lookAhead },
        beat: { start: startBeat, end: endBeat },
        generation,
        transport: { state: this.state.value, position: this._timeline.position },
      };
      this._onTick({
        ...coreWindow,
        rulers: this._timeline._readWindowRulers(coreWindow),
      } as TickWindow<TRulers>);
    }

    this._previousWindowEndBeat = endBeat;
    this._previousWindowEndGeneration = generation;
  }
}
