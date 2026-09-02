import { describe, expect, it } from "vitest";
import { flashDelayMs } from "./flashTime";

describe("flashDelayMs", () => {
  it("converts hit time + path latency + output latency into a forward-looking delay", () => {
    // hit at 1s, 480 samples of path latency at 48kHz (0.01s), 0.005s output latency, now at 0.5s
    // arrival = 1 + 0.01 + 0.005 = 1.015s; delay = (1.015 - 0.5) * 1000
    expect(flashDelayMs(1, 480, 48000, 0.005, 0.5)).toBeCloseTo(515, 6);
  });

  it("clamps to 0 when the arrival is already in the past", () => {
    expect(flashDelayMs(0, 0, 48000, 0, 1)).toBe(0);
  });

  it("includes outputLatency's contribution even when path latency is 0", () => {
    // arrival = 0.2 + 0 + 0.02 = 0.22s; delay = (0.22 - 0.2) * 1000 = 20ms
    expect(flashDelayMs(0.2, 0, 48000, 0.02, 0.2)).toBeCloseTo(20, 6);
  });
});
