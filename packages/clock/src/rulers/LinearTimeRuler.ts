import type { CoreTickWindow } from "../types";
import type { Ruler, TimelineLike } from "./Ruler";

export interface LinearTimePoint {
  seconds: number;
}

/**
 * Absolute seconds played since transport start — pause-aware, mirrors
 * `timeline.position` directly. Not derivable from `beat` alone: pauses
 * break the beat<->wallclock correspondence (see TimelineLike.position).
 */
export class LinearTimeRuler implements Ruler<LinearTimePoint, LinearTimePoint> {
  at(_beat: number, timeline: TimelineLike): LinearTimePoint {
    return { seconds: timeline.position };
  }

  read(_window: CoreTickWindow, timeline: TimelineLike): LinearTimePoint {
    return this.at(0, timeline);
  }
}
