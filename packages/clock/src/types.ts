export type TransportState = "stopped" | "playing" | "paused";

/**
 * The window payload minus `rulers` — what a Ruler's read()/at() methods
 * receive. Kept separate from the full TickWindow to avoid a circular
 * dependency between the window shape and the rulers that enrich it.
 */
export interface CoreTickWindow {
  time: {
    started: number;
    current: number;
    lookAheadEnd: number;
  };
  beat: {
    start: number;
    end: number;
  };
  generation: number;
  transport: {
    state: TransportState;
    position: number;
  };
}

/** A structural time source: anything exposing AudioContext.currentTime. */
export interface TimeSource {
  readonly currentTime: number;
}
