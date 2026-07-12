import { Param } from "@audiorective/core";
import { TempoParam } from "./TempoParam";
import type { Ruler } from "./rulers/Ruler";
import type { CoreTickWindow, TimeSource, TransportState } from "./types";

interface RulerSlot<TPoint> {
  readonly current: Param<TPoint>;
}

interface RulerEntry {
  ruler: Ruler<unknown, unknown>;
  current: Param<unknown>;
}

/**
 * Owns the transport anchor + tempo curve — the beat<->time mapping itself.
 * Conversions are valid even while paused or before a Clock ever ticks.
 * Beat position is never stored beyond the anchor; see the clock design
 * spec's "The core is three things" section.
 */
export class Timeline<TRulers extends Record<string, Ruler<unknown, unknown>> = Record<string, never>> {
  readonly bpm: TempoParam;

  private readonly _audioContext: TimeSource;
  private readonly _rulers = new Map<string, RulerEntry>();
  private readonly _rulersView: Record<string, RulerSlot<unknown>> = {};

  private _beatAtAnchor = 0;
  private _timeAtAnchor: number;
  private _positionAtAnchor = 0;
  private _state: TransportState = "stopped";
  private _generation = 0;

  constructor(options: { audioContext: TimeSource; bpm?: number }) {
    this._audioContext = options.audioContext;
    this._timeAtAnchor = this._audioContext.currentTime;
    this.bpm = new TempoParam({ default: options.bpm ?? 120, now: () => this._audioContext.currentTime });
  }

  private _now(): number {
    return this._audioContext.currentTime;
  }

  get state(): TransportState {
    return this._state;
  }

  get generation(): number {
    return this._generation;
  }

  /** Pause-aware played seconds — a stopwatch, not tempo-scaled. */
  get position(): number {
    return this._state === "playing" ? this._positionAtAnchor + (this._now() - this._timeAtAnchor) : this._positionAtAnchor;
  }

  /**
   * While playing: the normal integral from the real anchor. While not
   * playing: answers "as if the transport resumed now" by substituting
   * `now` for `timeAtAnchor`.
   */
  beatToTime(beat: number): number {
    const origin = this._state === "playing" ? this._timeAtAnchor : this._now();
    return origin + this.bpm._curveForTimeline.timeToAdvance(origin, beat - this._beatAtAnchor);
  }

  /**
   * While playing: the normal integral to `time`. While not playing, beat
   * position is frozen — returns the anchored beat regardless of `time`.
   */
  timeToBeat(time: number): number {
    if (this._state !== "playing") return this._beatAtAnchor;
    return this._beatAtAnchor + this.bpm._curveForTimeline.beatsBetween(this._timeAtAnchor, time);
  }

  addRuler<K extends string, TWindow, TPoint>(key: K, ruler: Ruler<TWindow, TPoint>): Timeline<TRulers & Record<K, Ruler<TWindow, TPoint>>> {
    const now = this._now();
    const current = new Param<TPoint>({ default: ruler.at(this.timeToBeat(now), this) });
    this._rulers.set(key, { ruler: ruler as Ruler<unknown, unknown>, current: current as Param<unknown> });
    this._rulersView[key] = current as unknown as RulerSlot<unknown>;
    return this as unknown as Timeline<TRulers & Record<K, Ruler<TWindow, TPoint>>>;
  }

  get rulers(): { [K in keyof TRulers]: RulerSlot<TRulers[K] extends Ruler<unknown, infer TPoint> ? TPoint : never> } {
    return this._rulersView as never;
  }

  /** @internal Called by the Clock tick to refresh every ruler's `current` reading. */
  _refreshRulerCurrents(now: number): void {
    const beat = this.timeToBeat(now);
    for (const { ruler, current } of this._rulers.values()) {
      current.value = ruler.at(beat, this);
    }
  }

  /** @internal Builds the `rulers` object for a TickWindow. */
  _readWindowRulers(coreWindow: CoreTickWindow): { [K in keyof TRulers]: TRulers[K] extends Ruler<infer TWindow, unknown> ? TWindow : never } {
    const out: Record<string, unknown> = {};
    for (const [key, { ruler }] of this._rulers) {
      out[key] = ruler.read(coreWindow, this);
    }
    return out as never;
  }

  /** @internal Anchor write for Clock.start()/start({ atBeat }). Always a jump. */
  _start(atBeat = 0): void {
    const now = this._now();
    this._beatAtAnchor = atBeat;
    this._timeAtAnchor = now;
    this._positionAtAnchor = (atBeat * 60) / this.bpm.valueAtTime(now);
    this._state = "playing";
    this._generation++;
  }

  /** @internal Anchor write for Clock.pause(). Freezes position; not a jump. */
  _pause(): void {
    const now = this._now();
    if (this._state === "playing") {
      this._beatAtAnchor = this.timeToBeat(now);
      this._positionAtAnchor += now - this._timeAtAnchor;
    }
    this._timeAtAnchor = now;
    this._state = "paused";
  }

  /** @internal Anchor write for Clock.resume(). Continuous; not a jump. */
  _resume(): void {
    this._timeAtAnchor = this._now();
    this._state = "playing";
  }

  /** @internal Anchor write for Clock.stop(). Resets position. */
  _stop(): void {
    this._beatAtAnchor = 0;
    this._timeAtAnchor = this._now();
    this._positionAtAnchor = 0;
    this._state = "stopped";
  }

  /** @internal Anchor write for Clock.seek(beat). Always a jump; state unchanged. */
  _seek(beat: number): void {
    const now = this._now();
    this._beatAtAnchor = beat;
    this._timeAtAnchor = now;
    this._positionAtAnchor = (beat * 60) / this.bpm.valueAtTime(now);
    this._generation++;
  }
}
