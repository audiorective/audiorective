import type { CoreTickWindow } from "../types";

/**
 * The minimal Timeline surface a Ruler needs. A structural interface (not
 * the concrete Timeline class) so rulers never import Timeline.ts and no
 * circular dependency exists between the two.
 */
export interface TimelineLike {
  beatToTime(beat: number): number;
  timeToBeat(time: number): number;
}

/**
 * A ruler interprets the beat axis into another coordinate system. Rulers
 * hold no position state: every reading is a pure function of the beat
 * position (and, for window reads, the window bounds) passed in.
 */
export interface Ruler<TWindow, TPoint> {
  /** A window-scoped reading; grid()/spans close over the window's beat range. */
  read(window: CoreTickWindow, timeline: TimelineLike): TWindow;
  /** A reading at an arbitrary beat position — feeds the reactive `current` cell. */
  at(beat: number, timeline: TimelineLike): TPoint;
}
