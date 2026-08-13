export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Default half-width of the venue in metres; x beyond ±this clamps to a hard L/R. */
export const STAGE_HALF_WIDTH = 5;

/**
 * Collapse a drone's world position to a stereo pan (-1..1) for the headphone
 * "mixdown". Fixed-frame: depends only on horizontal x, so the monitor image is
 * stable regardless of where the listener walks or looks.
 */
export function azimuthToPan(pos: Vec3, halfWidth = STAGE_HALF_WIDTH): number {
  const p = pos.x / halfWidth;
  return Math.max(-1, Math.min(1, p));
}
