import type { CoreTickWindow } from "../types";
import { assertFiniteOffset, assertPositiveLength, beatsPerBar, cycleGridPoints } from "./Ruler";
import type { CycleGridPoint, Ruler, TimelineLike } from "./Ruler";

export interface CycleBarRulerOptions {
  numerator: number;
  denominator: number;
  /** Cycle length, in bars. */
  bars: number;
  /** Axis beat where the cycle region starts. Default 0. */
  from?: number;
}

export interface CycleBarPoint {
  cycle: number;
  barInCycle: number;
  beatInBar: number;
  /** Position within the cycle, in [0, 1). */
  phase: number;
}

export interface CycleSpan {
  fromCycle: number;
  toCycle: number;
  /** Converts a cycle-relative position back to absolute audio-clock time for this pass. */
  toTime(cyclePosition: number): number;
}

export interface CycleBarWindow extends CycleBarPoint {
  /**
   * Grid points at `division` steps per cycle. Crossing the wrap needs no
   * special case.
   *
   * Each point's `step` is cycle-relative — pass a pattern's length as
   * `division` and `step` indexes it directly. This is the one place a cycle
   * ruler's grid differs from a linear ruler's, which counts forever.
   */
  grid(division: number): Generator<CycleGridPoint>;
  /**
   * The window's beat range mapped to cycle-relative sub-ranges — usually
   * one, two if the window crosses the loop boundary. For non-grid content
   * (e.g. notes stored at a cycle-relative position): the same cycle
   * position converts to a different absolute time on each pass, which is
   * why each span carries its own `toTime`.
   */
  spans: CycleSpan[];
}

/**
 * A repeating N-bar region [from, from + bars*beatsPerBar) — the Link-style
 * quantum/phase reading, and how looping is expressed: the beat axis never
 * jumps, this ruler just reads it modulo the region length.
 */
export class CycleBarRuler implements Ruler<CycleBarWindow, CycleBarPoint> {
  private readonly _beatsPerBar: number;
  private readonly _regionLength: number;
  private readonly _from: number;

  constructor(options: CycleBarRulerOptions) {
    assertPositiveLength(options.bars, "bars");
    assertFiniteOffset(options.from ?? 0, "from");
    this._beatsPerBar = beatsPerBar(options.numerator, options.denominator);
    this._regionLength = options.bars * this._beatsPerBar;
    this._from = options.from ?? 0;
  }

  at(beat: number): CycleBarPoint {
    const rel = beat - this._from;
    const cycle = Math.floor(rel / this._regionLength);
    const cyclePosition = rel - cycle * this._regionLength;
    const barInCycle = Math.floor(cyclePosition / this._beatsPerBar);
    const beatInBar = cyclePosition - barInCycle * this._beatsPerBar;
    const phase = cyclePosition / this._regionLength;
    return { cycle, barInCycle, beatInBar, phase };
  }

  read(window: CoreTickWindow, timeline: TimelineLike): CycleBarWindow {
    const point = this.at(window.beat.start);
    return {
      ...point,
      grid: (division: number) => cycleGridPoints(window.beat.start, window.beat.end, this._regionLength / division, this._from, division, timeline),
      spans: this._spans(window.beat.start, window.beat.end, timeline),
    };
  }

  private _spans(startBeat: number, endBeat: number, timeline: TimelineLike): CycleSpan[] {
    const spans: CycleSpan[] = [];
    let cursor = startBeat;
    while (cursor < endBeat) {
      const cyclesSinceFrom = Math.floor((cursor - this._from) / this._regionLength);
      const passStart = this._from + cyclesSinceFrom * this._regionLength;
      const passEnd = passStart + this._regionLength;
      const segEnd = Math.min(endBeat, passEnd);
      spans.push({
        fromCycle: cursor - passStart,
        toCycle: segEnd - passStart,
        toTime: (cyclePosition: number) => timeline.beatToTime(passStart + cyclePosition),
      });
      cursor = segEnd;
    }
    return spans;
  }
}
