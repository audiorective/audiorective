export const PILE_COUNT = 6;

// Deterministic PRNG (mulberry32) seeded from a loop counter, so a given
// loop always reproduces the same pile set but different loops diverge.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Picks `count` distinct pile indices out of PILE_COUNT piles, deterministically
 * derived from `seed`. Different seeds (successive loop numbers) yield
 * different sets so the animation pulls from varied piles loop to loop.
 */
export function pickPiles(seed: number, count: number): number[] {
  const random = mulberry32(seed * 2654435761 + 1);
  const pool = Array.from({ length: PILE_COUNT }, (_, i) => i);

  // Fisher-Yates shuffle driven by the seeded PRNG, then take the prefix.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return pool.slice(0, count);
}

/**
 * Target positions (relative, roughly -1..1) for assembled bricks. The
 * layout traces a waveform-like zig-zag that resolves into a play-button
 * triangle silhouette for the final piece, so the shipped shape faintly
 * echoes both motifs regardless of how many pieces are supplied.
 */
export function assembleShape(pieces: number[]): { x: number; y: number }[] {
  const n = pieces.length;
  if (n === 0) return [];

  // Waveform bars: evenly spaced columns, alternating amplitude.
  const waveform = pieces.map((_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = t * 2 - 1;
    const amplitude = Math.sin((i + 1) * 1.3) * 0.6;
    return { x, y: amplitude };
  });

  // Nudge the final piece toward a play-button apex (a single point at the
  // right edge, vertically centered) so the resolved cluster reads as an
  // arrow/triangle silhouette rather than a flat row.
  const last = waveform[n - 1];
  waveform[n - 1] = { x: Math.max(last.x, 0.8), y: 0 };

  return waveform;
}
