import { describe, expect, it } from "vitest";
import { dbToGain, gainToDb } from "../src";

describe("db helpers", () => {
  it("0 dB is unity, -6 dB halves, +20 dB is 10x", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6.0206)).toBeCloseTo(0.5, 4);
    expect(dbToGain(20)).toBeCloseTo(10, 9);
  });
  it("round-trips and clamps zero to -Infinity", () => {
    expect(gainToDb(dbToGain(-12.5))).toBeCloseTo(-12.5, 9);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(gainToDb(-1)).toBe(-Infinity);
  });
});
