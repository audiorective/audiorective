import type { CoreTickWindow } from "../types";
import type { Ruler, TimelineLike } from "./Ruler";

export interface CycleTimeRulerOptions {
  /** Cycle length, in seconds. */
  seconds: number;
  /** Played-seconds offset where the cycle region starts. Default 0. */
  from?: number;
}

export interface CycleTimePoint {
  cycle: number;
  secondsInCycle: number;
  /** Position within the cycle, in [0, 1). */
  phase: number;
}

/**
 * A repeating N-second region of played time — for visuals that repeat on a
 * wall-clock period rather than a musical one. Reads `timeline.position`
 * directly, same rationale as LinearTimeRuler.
 */
export class CycleTimeRuler implements Ruler<CycleTimePoint, CycleTimePoint> {
  private readonly _seconds: number;
  private readonly _from: number;

  constructor(options: CycleTimeRulerOptions) {
    this._seconds = options.seconds;
    this._from = options.from ?? 0;
  }

  at(_beat: number, timeline: TimelineLike): CycleTimePoint {
    const rel = timeline.position - this._from;
    const cycle = Math.floor(rel / this._seconds);
    const secondsInCycle = rel - cycle * this._seconds;
    const phase = secondsInCycle / this._seconds;
    return { cycle, secondsInCycle, phase };
  }

  read(_window: CoreTickWindow, timeline: TimelineLike): CycleTimePoint {
    return this.at(0, timeline);
  }
}
