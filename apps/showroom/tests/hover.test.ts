import { describe, test, expect } from "vitest";
import { hoverOffset } from "../src/scene/hover";

describe("hoverOffset", () => {
  test("is deterministic for the same (t, seed)", () => {
    expect(hoverOffset(1.23, 2)).toEqual(hoverOffset(1.23, 2));
  });
  test("different seeds give different offsets at the same time", () => {
    expect(hoverOffset(1.23, 0)).not.toEqual(hoverOffset(1.23, 5));
  });
  test("stays within a small bounded radius", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const o = hoverOffset(t, 3);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(o.z)).toBeLessThanOrEqual(0.4);
    }
  });
});
