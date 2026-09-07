import { describe, expect, it } from "vitest";
import { heardTime } from "../../src/demos/sequencer/audio/heardTime";

describe("heardTime", () => {
  it("is the render clock minus the graph's latency and the output latency", () => {
    // 480 samples at 48 kHz is 10 ms; with 5 ms of output latency the ear is 15 ms behind
    expect(heardTime(1, 480, 48000, 0.005)).toBeCloseTo(0.985, 9);
  });

  it("collapses to the render clock when nothing is in flight", () => {
    expect(heardTime(0.2, 0, 48000, 0)).toBe(0.2);
  });

  it("goes negative before a segment's first sound has reached the ear", () => {
    // the machine's `patternAt` maps a time before beat 0 to null -- no highlight yet
    expect(heardTime(0.01, 4800, 48000, 0.02)).toBeLessThan(0);
  });
});
