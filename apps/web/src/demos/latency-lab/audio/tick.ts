/** The slice of a tick window `Beat.schedule` / `Click.schedule` read: the pattern ruler's grid. */
export interface TickWindow {
  rulers: {
    pattern: {
      grid(division: number): Iterable<{ time: number; step: number }>;
    };
  };
}
