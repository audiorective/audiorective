import { expect, test } from "vitest";
import { assembleShape, pickPiles } from "../../src/components/landing/legoScene";

test("successive loops pull from different pile sets", () => {
  const a = pickPiles(1, 3);
  const b = pickPiles(2, 3);
  expect(new Set(a).size).toBe(3); // distinct within a loop
  expect(a.join()).not.toBe(b.join()); // variety across loops
});

test("pickPiles is deterministic for a given seed", () => {
  expect(pickPiles(1, 3)).toEqual(pickPiles(1, 3));
});

test("assembleShape returns one position per piece", () => {
  const positions = assembleShape([0, 1, 2, 3]);
  expect(positions).toHaveLength(4);
  for (const p of positions) {
    expect(typeof p.x).toBe("number");
    expect(typeof p.y).toBe("number");
  }
});
