import { describe, test, expect } from "vitest";
import { Timeline } from "../src/Timeline";

function makeContext(startAt = 0) {
  return { currentTime: startAt };
}

describe("Timeline — conversions at constant tempo", () => {
  test("beatToTime/timeToBeat round-trip while playing", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 }); // 2 beats/sec
    timeline._start();
    ctx.currentTime = 5;
    expect(timeline.timeToBeat(5)).toBeCloseTo(10);
    expect(timeline.beatToTime(10)).toBeCloseTo(5);
  });

  test("beatToTime/timeToBeat round-trip across a scheduled tempo step", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 60 }); // 1 beat/sec
    timeline._start();
    timeline.bpm.setValueAtTime(120, 10); // 2 beats/sec from t=10
    ctx.currentTime = 20;

    const beat = timeline.timeToBeat(20);
    expect(beat).toBeCloseTo(30); // 10 beats @60bpm + 20 beats @120bpm
    expect(timeline.beatToTime(beat)).toBeCloseTo(20, 9);
  });
});

describe("Timeline — pause/resume semantics", () => {
  test("pause freezes timeToBeat regardless of the time argument", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    ctx.currentTime = 5; // 10 beats elapsed
    timeline._pause();
    expect(timeline.timeToBeat(5)).toBeCloseTo(10);
    ctx.currentTime = 50; // time keeps moving; frozen beat must not
    expect(timeline.timeToBeat(50)).toBeCloseTo(10);
  });

  test("beatToTime while paused answers as-if-resumed-now", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 }); // 2 beats/sec
    timeline._start();
    ctx.currentTime = 5; // frozen at beat 10
    timeline._pause();
    ctx.currentTime = 20; // time advances while paused
    // "as if resumed now" (t=20): beat 12 is 1 second (2 beats/sec) after the frozen beat 10
    expect(timeline.beatToTime(12)).toBeCloseTo(21);
  });

  test("resume continues from the frozen beat with no jump", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    ctx.currentTime = 5; // beat 10
    timeline._pause();
    ctx.currentTime = 100; // paused interval — must not count
    timeline._resume();
    ctx.currentTime = 101; // 1 more second of playing
    expect(timeline.timeToBeat(101)).toBeCloseTo(12); // 10 + 2 beats/sec * 1s
  });

  test("pause/resume does not bump generation", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    const gen = timeline.generation;
    timeline._pause();
    timeline._resume();
    expect(timeline.generation).toBe(gen);
  });
});

describe("Timeline — seek", () => {
  test("seek rewrites the anchor and bumps generation", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    ctx.currentTime = 5;
    const genBefore = timeline.generation;
    timeline._seek(64);
    expect(timeline.generation).toBe(genBefore + 1);
    expect(timeline.timeToBeat(5)).toBeCloseTo(64);
  });

  test("start() and start({ atBeat }) also bump generation", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    const gen0 = timeline.generation;
    timeline._start();
    expect(timeline.generation).toBe(gen0 + 1);
    timeline._start(16);
    expect(timeline.generation).toBe(gen0 + 2);
  });
});

describe("Timeline — position (pause-aware played seconds)", () => {
  test("position accumulates while playing and freezes while paused", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    ctx.currentTime = 3;
    expect(timeline.position).toBeCloseTo(3);
    timeline._pause();
    ctx.currentTime = 30; // must not count
    expect(timeline.position).toBeCloseTo(3);
    timeline._resume();
    ctx.currentTime = 31;
    expect(timeline.position).toBeCloseTo(4);
  });

  test("stop resets position to 0", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    ctx.currentTime = 5;
    timeline._stop();
    expect(timeline.position).toBe(0);
  });

  test("seek sets position from the target beat at constant tempo", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 }); // 2 beats/sec -> 0.5s/beat
    timeline._start();
    ctx.currentTime = 100;
    timeline._seek(20); // 20 beats * 0.5s/beat = 10s
    expect(timeline.position).toBeCloseTo(10);
  });
});
