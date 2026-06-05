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

  test("loop wraps currentTime and does not end naturally", async () => {
    const dest = ctx.createGain();
    let ended = 0;
    const v = new Voice(ctx, makeBuffer(ctx, 0.1), dest, { loop: true }, () => {
      ended++;
    });
    await delay(300); // many 0.1s loop cycles
    expect(v.isPlaying).toBe(true);
    expect(ended).toBe(0);
    expect(v.currentTime).toBeGreaterThanOrEqual(0);
    expect(v.currentTime).toBeLessThan(0.1); // wrapped within one loop length
    v.stop();
  });
});

describe("Voice — transport", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("pause freezes currentTime; resume continues from the saved offset", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(120);
    v.pause();
    expect(v.isPlaying).toBe(false);
    const frozen = v.currentTime;
    expect(frozen).toBeGreaterThan(0.05);
    await delay(120);
    expect(v.currentTime).toBeCloseTo(frozen, 2); // unchanged while paused
    v.resume();
    expect(v.isPlaying).toBe(true);
    await delay(120);
    expect(v.currentTime).toBeGreaterThan(frozen + 0.05);
    v.stop();
  });

  test("pause does not fire onEnded", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    let ended = 0;
    v.onEnded(() => {
      ended++;
    });
    await delay(60);
    v.pause();
    await delay(80);
    expect(ended).toBe(0);
    v.stop();
  });

  test("seek jumps currentTime (while playing and while paused)", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {});
    v.seek(3);
    expect(v.currentTime).toBeGreaterThan(2.9);
    expect(v.currentTime).toBeLessThan(3.3);
    v.pause();
    v.seek(1);
    expect(v.currentTime).toBeCloseTo(1, 2);
    v.stop();
  });

  test("seek clamps to [0, duration]", () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 1), dest, {}, () => {});
    v.pause();
    v.seek(-5);
    expect(v.currentTime).toBe(0);
    v.seek(99);
    expect(v.currentTime).toBeCloseTo(1, 2);
    v.stop();
  });

  test("rate change while playing keeps currentTime continuous", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {});
    await delay(120);
    const before = v.currentTime;
    v.rate = 3;
    const after = v.currentTime;
    expect(after).toBeCloseTo(before, 1); // no jump at the moment of change
    await delay(120);
    expect(v.currentTime).toBeGreaterThan(before + 0.2); // faster now
    v.stop();
  });

  test("pause() is ignored while a stop is scheduled; scheduled stop still finalizes once", async () => {
    const dest = ctx.createGain();
    let done = 0;
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {
      done++;
    });
    let ended = 0;
    v.onEnded(() => {
      ended++;
    });
    v.stop(ctx.currentTime + 0.05);
    v.pause(); // must be ignored while the scheduled stop is pending
    await delay(250);
    expect(ended).toBe(1);
    expect(done).toBe(1);
    expect(v.isPlaying).toBe(false);
  });

  test("double pause is a no-op", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(80);
    v.pause();
    const at = v.currentTime;
    v.pause();
    expect(v.currentTime).toBeCloseTo(at, 3);
    expect(v.isPlaying).toBe(false);
    v.stop();
  });

  test("resume while already playing is a no-op", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(80);
    const before = v.currentTime;
    v.resume();
    expect(v.isPlaying).toBe(true);
    expect(v.currentTime).toBeGreaterThanOrEqual(before);
    v.stop();
  });

  test("rate set while paused applies after resume", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {});
    await delay(60);
    v.pause();
    const at = v.currentTime;
    v.rate = 4;
    v.resume();
    await delay(140);
    expect(v.currentTime).toBeGreaterThan(at + 0.25); // ~0.14s wall * 4 ≈ 0.56s buffer
    v.stop();
  });
});
