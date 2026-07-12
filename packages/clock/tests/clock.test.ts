import { describe, test, expect, vi } from "vitest";
import { Clock } from "../src/Clock";
import type { TickWindow, MissedGap } from "../src/Clock";
import { Timeline } from "../src/Timeline";
import { ManualTickSource } from "../src/TickSource";

function makeContext(startAt = 0) {
  return { currentTime: startAt };
}

function makeHarness(bpm = 120, lookAhead = 0.1) {
  const ctx = makeContext(0);
  const timeline = new Timeline({ audioContext: ctx, bpm });
  const tickSource = new ManualTickSource();
  const windows: TickWindow<Record<string, never>>[] = [];
  const misses: MissedGap[] = [];
  const clock = new Clock({
    timeline,
    lookAhead,
    onTick: (w) => windows.push(w),
    onMiss: (m) => misses.push(m),
    tickSource,
  });
  return { ctx, timeline, tickSource, clock, windows, misses };
}

describe("Clock — windows while playing", () => {
  test("windows are contiguous and non-overlapping", () => {
    // ticks spaced at half the lookAhead (realistic: tickInterval < lookAhead),
    // so each tick's "now" stays within the previous window -- no miss.
    const { ctx, tickSource, clock, windows } = makeHarness(120, 0.1); // 2 beats/sec, 0.2 beats/window
    clock.start();
    tickSource.tick(); // now=0: window [0, 0.2) -- fills the initial lookAhead buffer
    ctx.currentTime = 0.05;
    tickSource.tick(); // now=0.05 (beat 0.1, still inside [0,0.2)): window [0.2, 0.3)
    ctx.currentTime = 0.1;
    tickSource.tick(); // now=0.1 (beat 0.2, at the previous window's end): window [0.3, 0.4)

    expect(windows).toHaveLength(3);
    const beats = windows.map((w) => [w.beat.start, w.beat.end]);
    expect(beats[0]![0]).toBeCloseTo(0);
    expect(beats[0]![1]).toBeCloseTo(0.2);
    expect(beats[1]![0]).toBeCloseTo(0.2);
    expect(beats[1]![1]).toBeCloseTo(0.3);
    expect(beats[2]![0]).toBeCloseTo(0.3);
    expect(beats[2]![1]).toBeCloseTo(0.4);
    // strictly non-overlapping / contiguous: each window's start === the previous window's end
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i]!.beat.start).toBe(windows[i - 1]!.beat.end);
    }
  });

  test("no window emitted when not playing", () => {
    const { tickSource, windows } = makeHarness();
    tickSource.tick(); // clock never started
    expect(windows).toHaveLength(0);
  });

  test("the first tick after start() never reports a false miss, even if real time passed before it fired", () => {
    // Some real time inevitably passes between start() anchoring the target
    // beat and the tick source's next callback -- previousWindowEndBeat was
    // set to the target beat at that exact instant, so by the time this tick
    // runs, timeToBeat(now) has already crept past it. Without the
    // fresh-segment exemption this fires a spurious miss on every start().
    const { ctx, tickSource, clock, windows, misses } = makeHarness(120, 0.1); // 2 beats/sec
    clock.start();
    ctx.currentTime = 0.01; // a small, unavoidable real delay before the first tick
    tickSource.tick();

    expect(misses).toHaveLength(0);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.beat.start).toBeCloseTo(0); // the target beat, not now-beat (0.02)
  });

  test("seek's next tick is also exempt from the miss check, even with real delay before it fires", () => {
    const { ctx, tickSource, clock, windows, misses } = makeHarness(120, 0.1);
    clock.start();
    tickSource.tick();
    ctx.currentTime = 0.05;

    clock.seek(64);
    ctx.currentTime = 0.06; // a small delay before the next tick fires
    tickSource.tick();

    expect(misses).toHaveLength(0);
    expect(windows[windows.length - 1]!.beat.start).toBeCloseTo(64); // the seek target, not now-beat
  });
});

describe("Clock — miss detection", () => {
  test("a late tick produces exactly one onMiss and the next window starts at now-beat", () => {
    const { ctx, tickSource, clock, windows, misses } = makeHarness(120, 0.1); // 2 beats/sec, 0.2 beats/window
    clock.start();
    tickSource.tick(); // window [0, 0.2); previousWindowEndBeat = 0.2

    ctx.currentTime = 5; // way late -- 10 beats have passed, window end was only at beat 0.2
    tickSource.tick();

    expect(misses).toHaveLength(1);
    expect(misses[0]!.gapStart).toBeCloseTo(0.2);
    expect(misses[0]!.gapEnd).toBeCloseTo(10); // 5s * 2 beats/sec
    expect(misses[0]!.gapDuration).toBeCloseTo(5 - 0.1); // now - beatToTime(gapStart)

    expect(windows).toHaveLength(2);
    expect(windows[1]!.beat.start).toBeCloseTo(10); // starts at now-beat, not the stale previous end
  });
});

describe("Clock — pause/resume", () => {
  test("pause stops window emission but `current` keeps refreshing", () => {
    const { ctx, tickSource, clock, windows } = makeHarness();
    clock.start();
    tickSource.tick();
    clock.pause();
    const countAfterPause = windows.length;

    ctx.currentTime = 1;
    tickSource.tick();
    expect(windows).toHaveLength(countAfterPause); // no new window while paused
    expect(clock.state.value).toBe("paused");
  });

  test("resume continues from the frozen beat with no generation bump, and no re-scheduling", () => {
    const { ctx, timeline, tickSource, clock, windows, misses } = makeHarness(120, 0.1);
    clock.start();
    tickSource.tick(); // window [0, 0.2); previousWindowEndBeat = 0.2 (scheduled 0.1s ahead of now=0)
    clock.pause(); // paused at now=0 (before the scheduled-ahead point is reached) -- frozen beat = 0
    const genBeforeResume = timeline.generation;

    ctx.currentTime = 100; // a long paused gap -- must not count
    clock.resume();
    expect(timeline.generation).toBe(genBeforeResume); // continuous, not a jump

    ctx.currentTime = 100.1; // 0.1s of playing after resume -> 0.2 beats past the frozen 0
    tickSource.tick();

    expect(misses).toHaveLength(0); // no false miss from the pause/resume round-trip
    const last = windows[windows.length - 1]!;
    // continues exactly from previousWindowEndBeat (0.2) -- the already-scheduled-ahead
    // portion is never re-emitted, and the new window picks up right where it left off
    expect(last.beat.start).toBeCloseTo(0.2);
    expect(last.beat.end).toBeCloseTo(0.4);
  });
});

describe("Clock — seek", () => {
  test("seek bumps generation; the next window starts exactly at the target beat", () => {
    const { ctx, timeline, tickSource, clock, windows } = makeHarness(120, 0.1);
    clock.start();
    tickSource.tick();
    ctx.currentTime = 0.2;

    const genBefore = timeline.generation;
    clock.seek(64);
    expect(timeline.generation).toBe(genBefore + 1);

    tickSource.tick();
    const last = windows[windows.length - 1]!;
    expect(last.beat.start).toBeCloseTo(64);
    expect(last.generation).toBe(genBefore + 1);
  });
});

describe("Clock — tempo changes mid-run", () => {
  test("a tempo step changes window beat-width accordingly", () => {
    const { ctx, timeline, tickSource, clock, windows } = makeHarness(60, 1); // 1 beat/sec, 1s lookAhead -> 1 beat/window
    clock.start();
    tickSource.tick(); // window [0, 1)

    timeline.bpm.setValueAtTime(120, 1); // 2 beats/sec starting at t=1
    ctx.currentTime = 1;
    tickSource.tick(); // window from beat1: lookAhead to t=2 -> 1 + 2 = 3

    const last = windows[windows.length - 1]!;
    expect(last.beat.start).toBeCloseTo(1);
    expect(last.beat.end).toBeCloseTo(3); // wider window: tempo doubled
  });
});

describe("Clock — destroy", () => {
  test("destroy stops the tick source", () => {
    const stop = vi.fn();
    const tickSource = { start: vi.fn(), stop };
    const ctx = makeContext(0);
    const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
    const clock = new Clock({ timeline, onTick: () => {}, tickSource });
    clock.destroy();
    expect(stop).toHaveBeenCalledOnce();
  });
});
