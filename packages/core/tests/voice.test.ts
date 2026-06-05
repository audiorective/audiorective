import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Voice } from "../src";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Voice — playback", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("starts playing on construction and connects to the destination", () => {
    const dest = ctx.createGain();
    let done = false;
    const v = new Voice(ctx, makeBuffer(ctx), dest, {}, () => {
      done = true;
    });
    expect(v.isPlaying).toBe(true);
    expect(v.duration).toBeGreaterThan(0);
    expect(done).toBe(false);
    v.stop();
  });

  test("currentTime advances roughly with wall-clock", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(150);
    expect(v.currentTime).toBeGreaterThan(0.08);
    expect(v.currentTime).toBeLessThan(0.5);
    v.stop();
  });

  test("currentTime advances ~2x at rate 2", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, { rate: 2 }, () => {});
    await delay(150);
    expect(v.currentTime).toBeGreaterThan(0.18);
    v.stop();
  });

  test("fires onEnded once and calls the onDone hook at natural end", async () => {
    const dest = ctx.createGain();
    let doneCount = 0;
    const v = new Voice(ctx, makeBuffer(ctx, 0.05), dest, {}, () => {
      doneCount++;
    });
    let endedCount = 0;
    v.onEnded(() => {
      endedCount++;
    });
    await delay(200);
    expect(endedCount).toBe(1);
    expect(doneCount).toBe(1);
    expect(v.isPlaying).toBe(false);
  });

  test("onEnded fires once on programmatic stop (not double with natural end)", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 0.5), dest, {}, () => {});
    let endedCount = 0;
    v.onEnded(() => {
      endedCount++;
    });
    v.stop();
    await delay(50);
    expect(endedCount).toBe(1);
    expect(v.isPlaying).toBe(false);
  });

  test("currentTime holds the stop position after stop() (does not keep advancing)", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(120);
    v.stop();
    const at = v.currentTime;
    expect(at).toBeGreaterThan(0.05);
    await delay(120);
    expect(v.currentTime).toBeCloseTo(at, 2);
  });

  test("scheduled stop(when) finalizes exactly once via onended after `when`", async () => {
    const dest = ctx.createGain();
    let doneCount = 0;
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {
      doneCount++;
    });
    let ended = 0;
    v.onEnded(() => {
      ended++;
    });
    v.stop(ctx.currentTime + 0.05);
    await delay(250);
    expect(ended).toBe(1);
    expect(doneCount).toBe(1);
    expect(v.isPlaying).toBe(false);
  });
});
