import { describe, test, expect } from "vitest";
import { azimuthToPan, type Vec3 } from "../src/audio/spatialMath";

const at = (x: number): Vec3 => ({ x, y: 1, z: -3 });

describe("azimuthToPan", () => {
  test("center maps to 0", () => {
    expect(azimuthToPan(at(0))).toBeCloseTo(0);
  });
  test("right is positive, left is negative", () => {
    expect(azimuthToPan(at(2.5))).toBeGreaterThan(0);
    expect(azimuthToPan(at(-2.5))).toBeLessThan(0);
  });
  test("clamps beyond the half-width to ±1", () => {
    expect(azimuthToPan(at(100))).toBe(1);
    expect(azimuthToPan(at(-100))).toBe(-1);
  });
  test("is listener-independent (depends only on x)", () => {
    expect(azimuthToPan({ x: 1.5, y: 0, z: 0 })).toBeCloseTo(azimuthToPan({ x: 1.5, y: 9, z: -50 }));
  });
});
