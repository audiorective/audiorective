/**
 * Milliseconds from `now` until a hit scheduled at `hitTime` finishes traveling
 * its graph path and clears the output — the delay a UI flash should wait
 * before firing, so it lands with the sound the listener actually hears.
 */
export function flashDelayMs(hitTime: number, pathLatencySamples: number, sampleRate: number, outputLatency: number, now: number): number {
  const arrivalTime = hitTime + pathLatencySamples / sampleRate + outputLatency;
  return Math.max(0, (arrivalTime - now) * 1000);
}
