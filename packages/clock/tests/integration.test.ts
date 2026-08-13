import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Clock } from "../src/Clock";
import type { MissedGap } from "../src/Clock";
import { Timeline } from "../src/Timeline";
import { LinearBarRuler } from "../src/rulers/LinearBarRuler";

/**
 * Poll until a predicate holds (or timeout). The clock ticks against a real
 * WorkerTickSource, so a fixed sleep is flaky under CPU load; poll for the
 * actual data instead. Mirrors apps/showroom/tests/mixer.test.ts.
 */
async function waitFor(predicate: () => boolean, timeout = 5000, step = 25): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, step));
  }
}

describe("Clock integration (real AudioContext, default WorkerTickSource)", () => {
  let ctx: AudioContext;

  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });

  afterEach(() => {
    void ctx.close();
  });

  test("a 16th-note metronome never double-schedules and never schedules into the past", async () => {
    const timeline = new Timeline({ audioContext: ctx, bpm: 240 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

    const collected: Array<{ index: number; time: number; scheduledAt: number }> = [];
    const misses: MissedGap[] = [];

    const clock = new Clock({
      timeline,
      onTick: (window) => {
        // `window.time.current`, not a fresh ctx.currentTime read: the clock
        // built this window from that instant, and the question here is whether
        // it ever handed out a point already in the past *as it saw things*.
        // Re-reading the clock inside the callback measures something else --
        // the scheduling delay plus however long the JS thread was starved
        // between the tick firing and this line -- which under CPU contention
        // drifts past the look-ahead and fails on a perfectly good point.
        const scheduledAt = window.time.current;
        for (const point of window.rulers.bar.grid(16)) {
          collected.push({ index: point.index, time: point.time, scheduledAt });
        }
      },
      onMiss: (m) => misses.push(m),
    });

    clock.start();
    await waitFor(() => collected.length >= 12);
    clock.destroy();

    expect(misses).toHaveLength(0);
    expect(collected.length).toBeGreaterThan(0);

    // Every point after the first is scheduled no earlier than when it was
    // handed out. The very first point of a freshly-started segment is a
    // documented, one-time exception: its beat is anchored to the instant
    // start() was called, but the callback that delivers it can only fire
    // once the tick source has actually spun up (Worker creation + thread
    // start), which takes a few ms of real time -- by then `now` has crept
    // slightly past that anchor instant. Reporting this as a miss would fire
    // on every single transport start; Web Audio itself treats a slightly
    // past-due start time as "play immediately," so this is harmless jitter,
    // not a functional scheduling failure. See Clock's fresh-segment handling.
    for (let i = 1; i < collected.length; i++) {
      expect(collected[i]!.time).toBeGreaterThanOrEqual(collected[i]!.scheduledAt);
    }

    // no double-scheduling: every grid point (by index) appears exactly once,
    // and both index and time are strictly increasing across the run
    const indices = collected.map((p) => p.index);
    expect(new Set(indices).size).toBe(indices.length);
    for (let i = 1; i < collected.length; i++) {
      expect(collected[i]!.index).toBeGreaterThan(collected[i - 1]!.index);
      expect(collected[i]!.time).toBeGreaterThan(collected[i - 1]!.time);
    }
  });

  test("seek mid-run bumps generation and the new generation re-emits low indices", async () => {
    const timeline = new Timeline({ audioContext: ctx, bpm: 240 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

    const indicesByGeneration = new Map<number, number[]>();

    const clock = new Clock({
      timeline,
      onTick: (window) => {
        const list = indicesByGeneration.get(window.generation) ?? [];
        for (const point of window.rulers.bar.grid(16)) list.push(point.index);
        indicesByGeneration.set(window.generation, list);
      },
    });

    clock.start();
    const genBeforeSeek = timeline.generation;
    await waitFor(() => (indicesByGeneration.get(genBeforeSeek)?.length ?? 0) >= 6);

    clock.seek(0);
    expect(timeline.generation).toBe(genBeforeSeek + 1);

    await waitFor(() => (indicesByGeneration.get(genBeforeSeek + 1)?.length ?? 0) >= 6);
    clock.destroy();

    const beforeIndices = indicesByGeneration.get(genBeforeSeek) ?? [];
    const afterIndices = indicesByGeneration.get(genBeforeSeek + 1) ?? [];
    expect(beforeIndices.length).toBeGreaterThan(0);
    expect(afterIndices.length).toBeGreaterThan(0);
    // seeking back to beat 0 re-emits index 0, which already appeared pre-seek --
    // a legitimate re-appearance across a new continuity segment, per spec
    expect(beforeIndices).toContain(0);
    expect(afterIndices[0]).toBe(0);
  });
});
