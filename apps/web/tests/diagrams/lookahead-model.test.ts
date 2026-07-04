import { simulateBeats } from "../../src/components/diagrams/lookaheadModel";
import { expect, test } from "vitest";
test("a GC hit makes exactly one JS beat late while audio stays on grid", () => {
  const beats = simulateBeats({ count: 8, jitter: 0.02, gcAt: 3 });
  expect(beats[3].late).toBe(true);
  expect(beats[3].audioActual).toBeCloseTo(beats[3].grid, 5); // audio never late
  expect(beats.filter((b) => b.late).length).toBe(1);
});
