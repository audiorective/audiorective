import { describe, test, expect } from "vitest";
import { clampToRoom } from "../src/scene/roomMath";

describe("clampToRoom", () => {
  const opts = { halfW: 7, halfD: 8, margin: 0.5 };
  test("leaves interior points untouched", () => {
    expect(clampToRoom(2, -3, opts)).toEqual({ x: 2, z: -3 });
  });
  test("clamps x to ±(halfW - margin)", () => {
    expect(clampToRoom(100, 0, opts).x).toBeCloseTo(6.5);
    expect(clampToRoom(-100, 0, opts).x).toBeCloseTo(-6.5);
  });
  test("clamps z to ±(halfD - margin)", () => {
    expect(clampToRoom(0, 100, opts).z).toBeCloseTo(7.5);
    expect(clampToRoom(0, -100, opts).z).toBeCloseTo(-7.5);
  });
});
