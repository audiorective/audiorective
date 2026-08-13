export interface Beat {
  grid: number;
  jsActual: number;
  audioActual: number;
  late: boolean;
}

const BEAT_INTERVAL = 1;
const GC_STALL = 0.35;
const LATE_THRESHOLD = 0.1;

/**
 * Deterministic stand-in for setTimeout jitter: varies by beat index so
 * results are stable across runs (no Math.random).
 */
function deterministicJitter(i: number, jitter: number): number {
  return jitter * Math.sin(i * 2.4);
}

export function simulateBeats(opts: { count: number; jitter: number; gcAt: number }): Beat[] {
  const { count, jitter, gcAt } = opts;
  const beats: Beat[] = [];

  for (let i = 0; i < count; i++) {
    const grid = i * BEAT_INTERVAL;
    const gcHit = i === gcAt;
    const jsActual = grid + deterministicJitter(i, jitter) + (gcHit ? GC_STALL : 0);

    beats.push({
      grid,
      jsActual,
      audioActual: grid,
      late: jsActual - grid > LATE_THRESHOLD,
    });
  }

  return beats;
}
