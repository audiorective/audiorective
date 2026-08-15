import { computeDesync } from "../../src/components/diagrams/StateDiagram";
import { expect, test } from "vitest";
test("audio value lags ui value during the desync window", () => {
  const early = computeDesync(0.1); // just after a slider move
  expect(early.ui).not.toBeCloseTo(early.audio, 2);
  const late = computeDesync(0.95); // after sync pulse completes
  expect(late.ui).toBeCloseTo(late.audio, 2);
});
