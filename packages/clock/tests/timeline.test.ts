import { describe, test, expect } from "vitest";
import { Timeline } from "../src/Timeline";
import { LinearBarRuler } from "../src/rulers/LinearBarRuler";

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

  test("resume while already playing is a no-op, not a rewind", () => {
    // _pause() guards on state; _resume() must too. Without the guard it moves
    // timeAtAnchor to now while beatAtAnchor stays stale, so position snaps
    // back to the anchor beat and the next windows replay scheduled beats.
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 }); // 2 beats/sec
    timeline._start();
    ctx.currentTime = 5;
    expect(timeline.timeToBeat(5)).toBeCloseTo(10);

    timeline._resume(); // redundant call while playing
    expect(timeline.timeToBeat(5)).toBeCloseTo(10); // position preserved
    expect(timeline.position).toBeCloseTo(5);
  });

  test("resume while stopped does not start playback", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._resume();
    expect(timeline.state).toBe("stopped");
  });

  test("pause while stopped stays stopped, so it cannot become resumable", () => {
    // The mirror of the guard above. When the state write sat outside the
    // "playing" check, a stopped transport went to "paused" and _resume()
    // then happily started it -- playback without a _start() to anchor the
    // position or bump the generation.
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    timeline._start();
    timeline._stop();

    timeline._pause();
    expect(timeline.state).toBe("stopped");

    timeline._resume();
    expect(timeline.state).toBe("stopped");
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

describe("Timeline — registered ruler slots", () => {
  // These read `rulers.<key>.current` the way a UI actually does. Nothing did
  // that before, and an `as unknown as` cast in addRuler was stashing the
  // Param *as* the slot -- so the types claimed `.current` existed while at
  // runtime it was undefined, and the first real consumer crashed on mount.
  test("rulers.<key>.current exposes the ruler's point reading", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

    const slot = timeline.rulers.bar;
    expect(slot).toBeDefined();
    expect(slot.current).toBeDefined();
    expect(slot.current.value).toMatchObject({ bar: 0, beatInBar: 0 });
  });

  test("the tick refresh advances the reading", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));
    timeline._start();

    ctx.currentTime = 2.5; // 5 beats in => bar 1, beat 1
    timeline._refreshRulerCurrents(ctx.currentTime);
    expect(timeline.rulers.bar.current.value).toMatchObject({ bar: 1, beatInBar: 1 });
  });

  test("multiple rulers keep independent slots", () => {
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 })
      .addRuler("fourFour", new LinearBarRuler({ numerator: 4, denominator: 4 }))
      .addRuler("threeFour", new LinearBarRuler({ numerator: 3, denominator: 4 }));
    timeline._start();

    ctx.currentTime = 1.5; // 3 beats in
    timeline._refreshRulerCurrents(ctx.currentTime);
    expect(timeline.rulers.fourFour.current.value).toMatchObject({ bar: 0, beatInBar: 3 });
    expect(timeline.rulers.threeFour.current.value).toMatchObject({ bar: 1, beatInBar: 0 });
  });
});
