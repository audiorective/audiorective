/**
 * Step resolution: 16 steps fill one bar of 4/4, i.e. sixteenth notes. This is
 * fixed — `patternLength` varies, and `patternLength / STEPS_PER_BAR` is how
 * many bars one pass of the pattern spans.
 */
export const STEPS_PER_BAR = 16;

/** One bar's worth of steps. Raise it to 32 for a two-bar pattern. */
export const DEFAULT_PATTERN_LENGTH = STEPS_PER_BAR;

/**
 * Which step of the pattern a cycle-ruler reading falls on.
 *
 * `phase` is already the fraction through one pass, so this works for any
 * pattern length without knowing the time signature — the ruler did that part.
 * Pure position math, shared by the UI playhead and the tests so both agree by
 * construction.
 */
export function stepFromPattern(point: { phase: number }, patternLength: number): number {
  const step = Math.floor(point.phase * patternLength);
  return Math.min(patternLength - 1, Math.max(0, step));
}
