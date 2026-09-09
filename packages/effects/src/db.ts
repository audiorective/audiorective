/** Linear gain for a level in decibels. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Level in decibels for a linear gain; `-Infinity` at 0. */
export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}
