export const STEPS_PER_BAR = 16;

/** Sixteenth-note steps per beat, given 16 steps across a 4-beat bar. */
const STEPS_PER_BEAT = 4;

/**
 * Which of the 16 steps a bar-ruler reading falls on. Pure position math —
 * shared by the UI playhead and the tests so both agree by construction.
 */
export function stepFromBar(point: { beatInBar: number }): number {
  const step = Math.floor(point.beatInBar * STEPS_PER_BEAT);
  return Math.min(STEPS_PER_BAR - 1, Math.max(0, step));
}
