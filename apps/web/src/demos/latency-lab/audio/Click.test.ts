import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Click } from "./Click";

describe("Click", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = new AudioContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it("records one tick per grid(4) point while enabled", () => {
    const click = new Click(ctx);
    const grid = Array.from({ length: 4 }, (_, step) => ({ time: step * 0.5, step }));
    const window = { rulers: { pattern: { grid: () => grid } } };

    click.schedule(window);

    expect(click.ticks.value).toEqual([0, 0.5, 1, 1.5]);
  });

  it("records nothing when disabled", () => {
    const click = new Click(ctx);
    click.enabled.value = false;
    const grid = Array.from({ length: 4 }, (_, step) => ({ time: step * 0.5, step }));
    const window = { rulers: { pattern: { grid: () => grid } } };

    click.schedule(window);

    expect(click.ticks.value).toEqual([]);
  });
});
