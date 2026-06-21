import { describe, test, expect } from "vitest";
import { rms } from "../src/audio/meterMath";

describe("rms", () => {
  test("silence is 0", () => {
    expect(rms(new Float32Array(64))).toBe(0);
  });
  test("constant full-scale is 1", () => {
    expect(rms(new Float32Array(64).fill(1))).toBeCloseTo(1);
  });
  test("constant -1 is also 1 (magnitude)", () => {
    expect(rms(new Float32Array(64).fill(-1))).toBeCloseTo(1);
  });
  test("half-amplitude is ~0.5", () => {
    expect(rms(new Float32Array(64).fill(0.5))).toBeCloseTo(0.5);
  });
});
