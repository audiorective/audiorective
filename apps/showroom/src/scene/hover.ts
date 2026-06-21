import type { Vec3 } from "../audio/spatialMath";

const AMP = 0.25; // metres
const SPEED = 0.6; // rad/s base

/** Gentle, deterministic per-drone hover bob. Phase offset by `seed` so drones don't move in lockstep. */
export function hoverOffset(t: number, seed: number): Vec3 {
  const p = seed * 1.7;
  return {
    x: Math.sin(t * SPEED + p) * AMP,
    y: Math.sin(t * SPEED * 1.3 + p * 2) * AMP,
    z: Math.cos(t * SPEED * 0.8 + p) * AMP,
  };
}
