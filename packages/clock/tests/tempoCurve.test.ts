import { describe, test, expect } from "vitest";
import { TempoCurve } from "../src/TempoCurve";

describe("TempoCurve — construction & validation", () => {
  test("throws on non-finite or non-positive bpm", () => {
    expect(() => new TempoCurve(0)).toThrow(RangeError);
    expect(() => new TempoCurve(-10)).toThrow(RangeError);
    expect(() => new TempoCurve(Infinity)).toThrow(RangeError);
    expect(() => new TempoCurve(NaN)).toThrow(RangeError);
  });

  test("setValueAtTime throws on invalid bpm", () => {
    const curve = new TempoCurve(120);
    expect(() => curve.setValueAtTime(0, 5)).toThrow(RangeError);
    expect(() => curve.setValueAtTime(-1, 5)).toThrow(RangeError);
  });

  test("valueAt before any event returns the initial bpm", () => {
    const curve = new TempoCurve(120);
    expect(curve.valueAt(-100)).toBe(120);
    expect(curve.valueAt(0)).toBe(120);
    expect(curve.valueAt(1000)).toBe(120);
  });
});

describe("TempoCurve — constant tempo (linear integrals)", () => {
  test("beatsBetween is linear at constant bpm", () => {
    const curve = new TempoCurve(120); // 2 beats/sec
    expect(curve.beatsBetween(0, 1)).toBeCloseTo(2);
    expect(curve.beatsBetween(0, 30)).toBeCloseTo(60);
    expect(curve.beatsBetween(10, 20)).toBeCloseTo(20);
  });

  test("beatsBetween(t, t) and reversed range are 0", () => {
    const curve = new TempoCurve(120);
    expect(curve.beatsBetween(5, 5)).toBe(0);
    expect(curve.beatsBetween(5, 2)).toBe(0);
  });

  test("timeToAdvance is linear at constant bpm", () => {
    const curve = new TempoCurve(120); // 2 beats/sec -> 0.5s/beat
    expect(curve.timeToAdvance(0, 2)).toBeCloseTo(1);
    expect(curve.timeToAdvance(10, 20)).toBeCloseTo(10);
  });

  test("timeToAdvance(t, 0) is 0", () => {
    const curve = new TempoCurve(120);
    expect(curve.timeToAdvance(42, 0)).toBe(0);
    expect(curve.timeToAdvance(42, -5)).toBe(0);
  });

  test("timeToAdvance is the exact inverse of beatsBetween", () => {
    const curve = new TempoCurve(90);
    const from = 3.3;
    const beats = curve.beatsBetween(from, 17.7);
    const advance = curve.timeToAdvance(from, beats);
    expect(advance).toBeCloseTo(17.7 - from, 10);
  });
});

describe("TempoCurve — step events split the integral", () => {
  test("a step at t=10 changes the beat rate exactly at that time", () => {
    const curve = new TempoCurve(60); // 1 beat/sec
    curve.setValueAtTime(120, 10); // 2 beats/sec from t=10

    // segment [0,10) at 60bpm = 10 beats; segment [10,20) at 120bpm = 20 beats
    expect(curve.beatsBetween(0, 10)).toBeCloseTo(10);
    expect(curve.beatsBetween(0, 20)).toBeCloseTo(30);
    expect(curve.beatsBetween(10, 20)).toBeCloseTo(20);
  });

  test("event takes effect at its own time (valueAt is left-closed per segment)", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    expect(curve.valueAt(9.999)).toBe(60);
    expect(curve.valueAt(10)).toBe(120);
    expect(curve.valueAt(10.001)).toBe(120);
  });

  test("timeToAdvance is the exact inverse across a segment boundary", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    curve.setValueAtTime(30, 25);

    const from = 4;
    const beats = curve.beatsBetween(from, 40);
    const advance = curve.timeToAdvance(from, beats);
    expect(advance).toBeCloseTo(40 - from, 9);

    // and crossing exactly one boundary
    const beats2 = curve.beatsBetween(5, 15);
    expect(curve.timeToAdvance(5, beats2)).toBeCloseTo(10, 9);
  });

  test("setValueAtTime at an existing event time replaces it, not duplicates", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    curve.setValueAtTime(200, 10);
    expect(curve.valueAt(10)).toBe(200);
    expect(curve.beatsBetween(10, 11)).toBeCloseTo(200 / 60);
  });

  test("out-of-order insertion still sorts correctly", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(90, 20);
    curve.setValueAtTime(120, 10);
    expect(curve.valueAt(5)).toBe(60);
    expect(curve.valueAt(15)).toBe(120);
    expect(curve.valueAt(25)).toBe(90);
  });
});

describe("TempoCurve — cancellation", () => {
  test("cancelScheduledValues drops events at/after the given time", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    curve.setValueAtTime(180, 20);
    curve.cancelScheduledValues(15);
    expect(curve.valueAt(25)).toBe(120); // the 180 step at t=20 is gone
    expect(curve.valueAt(10)).toBe(120); // the 120 step at t=10 survives (< 15)
  });

  test("cancelScheduledValues never removes the initial event", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    curve.cancelScheduledValues(0);
    expect(curve.valueAt(0)).toBe(60);
    expect(curve.valueAt(100)).toBe(60);
  });

  test("cancelScheduledValues with a time past all events is a no-op", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    curve.cancelScheduledValues(1000);
    expect(curve.valueAt(10)).toBe(120);
  });

  test("cancelAndHoldAtTime holds the value at the cancel point and drops future events", () => {
    const curve = new TempoCurve(60);
    curve.setValueAtTime(120, 10);
    curve.setValueAtTime(180, 20);
    curve.cancelAndHoldAtTime(15);
    expect(curve.valueAt(15)).toBe(120);
    expect(curve.valueAt(100)).toBe(120); // held, not 180
  });
});
