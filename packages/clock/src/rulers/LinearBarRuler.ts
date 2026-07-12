import type { CoreTickWindow } from "../types";
import { beatsPerBar, gridPoints } from "./Ruler";
import type { GridPoint, Ruler, TimelineLike } from "./Ruler";

export interface LinearBarRulerOptions {
  numerator: number;
  denominator: number;
}

export interface LinearBarPoint {
  bar: number;
  beatInBar: number;
  numerator: number;
  denominator: number;
}

export interface LinearBarWindow extends LinearBarPoint {
  /** Grid points at `division` steps per bar, aligned to bar 0 at axis beat 0. */
  grid(division: number): Generator<GridPoint>;
}

/** Bars counted forever from axis beat 0 — the timeline the app is showing. */
export class LinearBarRuler implements Ruler<LinearBarWindow, LinearBarPoint> {
  private readonly _numerator: number;
  private readonly _denominator: number;
  private readonly _beatsPerBar: number;

  constructor(options: LinearBarRulerOptions) {
    this._numerator = options.numerator;
    this._denominator = options.denominator;
    this._beatsPerBar = beatsPerBar(options.numerator, options.denominator);
  }

  at(beat: number): LinearBarPoint {
    const bar = Math.floor(beat / this._beatsPerBar);
    const beatInBar = beat - bar * this._beatsPerBar;
    return { bar, beatInBar, numerator: this._numerator, denominator: this._denominator };
  }

  read(window: CoreTickWindow, timeline: TimelineLike): LinearBarWindow {
    const point = this.at(window.beat.start);
    return {
      ...point,
      grid: (division: number) => gridPoints(window.beat.start, window.beat.end, this._beatsPerBar / division, 0, timeline),
    };
  }
}
