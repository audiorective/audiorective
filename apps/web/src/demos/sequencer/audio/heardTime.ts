/**
 * The schedule-axis time the listener is hearing right now. A hit scheduled
 * at `t` still has to travel the graph (`latencySamples`, the engine's
 * compensated path latency into the destination) and the output stage
 * (`outputLatency`), so at render time `now` the ear is at `now` minus both.
 * Pure arithmetic, shared by the UI playhead and the tests.
 */
export function heardTime(now: number, latencySamples: number, sampleRate: number, outputLatency: number): number {
  return now - latencySamples / sampleRate - outputLatency;
}
