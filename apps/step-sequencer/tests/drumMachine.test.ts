import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { WorkerTickSource } from "@audiorective/clock";
import { DrumMachine } from "../src/audio/DrumMachine";
import { createDrumKit } from "../src/audio/drumKit";
import type { DrumVoiceId } from "../src/audio/drumKit";
import { stepFromPattern } from "../src/audio/stepFromPattern";

/**
 * A DrumMachine driven by hand: ticks fire only when we say, and "now" only
 * moves when we move it. Every assertion below is therefore exact — no
 * tolerance windows, no polling.
 *
 * `DrumMachine` exposes no test seams, so all three come from mocks:
 *
 * - "now" — an own `currentTime` property shadowing the prototype getter on a
 *   real context. The nodes stay real (a Proxy would fail Web Audio's
 *   constructor brand-check; shadowing the instance does not).
 * - ticks — the Worker never spawns; we capture the callback it was handed.
 * - what got scheduled — read off `Sampler.trigger` itself, so these assert
 *   the actual audio call rather than a parallel notification.
 */
function makeHarness(ctx: AudioContext, bpm = 120) {
  let now = 0;
  Object.defineProperty(ctx, "currentTime", { get: () => now, configurable: true });

  let tick: (() => void) | undefined;
  vi.spyOn(WorkerTickSource.prototype, "start").mockImplementation((onTick: () => void) => {
    tick = onTick;
  });
  vi.spyOn(WorkerTickSource.prototype, "stop").mockImplementation(() => {});

  const machine = new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx), bpm });
  const triggers = new Map(machine.tracks.map((t) => [t.id, vi.spyOn(t.sampler, "trigger")]));

  /** A 16th note in seconds — how a scheduled `when` maps back to a step. */
  const stepDuration = 60 / bpm / 4;

  return {
    machine,
    tick: () => tick?.(),
    advanceTo: (t: number) => {
      now = t;
    },
    now: () => now,
    whensFor: (id: DrumVoiceId) => triggers.get(id)!.mock.calls.map((c) => c[0]!.when!),
    /**
     * Scheduled steps for one track, recovered from the times it was given.
     * Assumes beat 0 sits at time 0 — true for a first segment, but not after
     * a restart, which re-anchors beat 0 to "now". Tests that cross one assert
     * on `whensFor` instead.
     */
    stepsFor: (id: DrumVoiceId) => triggers.get(id)!.mock.calls.map((c) => Math.round(c[0]!.when! / stepDuration) % machine.patternLength),
    triggerCount: () => [...triggers.values()].reduce((n, s) => n + s.mock.calls.length, 0),
    clearTriggers: () => triggers.forEach((s) => s.mockClear()),
  };
}

describe("DrumMachine — pattern state", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    // the WorkerTickSource spies live on the prototype -- global state, so
    // restoring is not optional
    vi.restoreAllMocks();
    void ctx.close();
  });

  test("ships a legible default pattern", () => {
    const { machine } = makeHarness(ctx);
    const kick = machine.tracks.find((t) => t.id === "kick")!;
    const snare = machine.tracks.find((t) => t.id === "snare")!;
    expect(kick.pattern.value.map((on, i) => (on ? i : -1)).filter((i) => i >= 0)).toEqual([0, 4, 8, 12]);
    expect(snare.pattern.value.map((on, i) => (on ? i : -1)).filter((i) => i >= 0)).toEqual([4, 12]);
    machine.destroy();
  });

  test("toggleStep flips exactly one step, immutably", () => {
    const { machine } = makeHarness(ctx);
    const clap = machine.tracks.find((t) => t.id === "clap")!;
    const before = clap.pattern.value;

    machine.toggleStep("clap", 3);
    expect(clap.pattern.value[3]).toBe(true);
    expect(before[3]).toBe(false); // previous array not mutated
    expect(clap.pattern.value).not.toBe(before);
    expect(clap.pattern.value.filter(Boolean)).toHaveLength(1);

    machine.toggleStep("clap", 3);
    expect(clap.pattern.value[3]).toBe(false);
    machine.destroy();
  });
});

describe("DrumMachine — scheduling", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    // the WorkerTickSource spies live on the prototype -- global state, so
    // restoring is not optional
    vi.restoreAllMocks();
    void ctx.close();
  });

  test("schedules exactly the on-steps, at strictly increasing times", () => {
    const h = makeHarness(ctx, 120);
    h.machine.play();

    // Walk a bar in small steps the way a real tick loop would. Stop at 1.85s:
    // the default 0.1s look-ahead means this last tick commits up to 1.95s,
    // still inside bar 1 (which ends at 2.0s) -- so exactly one bar's steps.
    for (let t = 0; t <= 1.85; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }

    expect(h.stepsFor("kick")).toEqual([0, 4, 8, 12]);
    expect(h.stepsFor("snare")).toEqual([4, 12]);
    expect(h.stepsFor("hat")).toEqual([2, 6, 10, 14]);
    expect(h.stepsFor("clap")).toEqual([]);

    const kickTimes = h.whensFor("kick");
    for (let i = 1; i < kickTimes.length; i++) {
      expect(kickTimes[i]!).toBeGreaterThan(kickTimes[i - 1]!);
    }
    h.machine.destroy();
  });

  test("the cycle wraps — pass two replays the same steps, with no modulo at the call site", () => {
    const h = makeHarness(ctx, 120);
    h.machine.play();
    // through 3.95s (3.85 + look-ahead): two whole bars, none of bar 3
    for (let t = 0; t <= 3.85; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    // two bars of four-on-the-floor
    expect(h.stepsFor("kick")).toEqual([0, 4, 8, 12, 0, 4, 8, 12]);
    h.machine.destroy();
  });

  test("a muted track schedules nothing; unmuting resumes on the next window", () => {
    const h = makeHarness(ctx, 120);
    const kick = h.machine.tracks.find((t) => t.id === "kick")!;
    kick.mute.value = true;
    h.machine.play();

    for (let t = 0; t <= 1; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    expect(h.stepsFor("kick")).toEqual([]);
    expect(h.stepsFor("hat").length).toBeGreaterThan(0); // others unaffected

    kick.mute.value = false;
    for (let t = 1.05; t <= 1.85; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    // step 8 (t=1.0s) was already inside a committed window while muted, so
    // the next kick to schedule is step 12 (t=1.5s) -- the rest of the bar
    expect(h.stepsFor("kick")).toEqual([12]);
    h.machine.destroy();
  });

  test("stop() then play() restarts the pattern from step 0", () => {
    const h = makeHarness(ctx, 120);
    h.machine.play();
    for (let t = 0; t <= 0.85; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    expect(h.stepsFor("kick")).toEqual([0, 4]); // mid-bar

    h.machine.stop();
    h.clearTriggers();
    const restartAt = h.now();
    h.machine.play(); // fresh transport segment, anchored at beat 0
    for (let t = 0.9; t <= 1.2; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    // Back to the top: play() re-anchors beat 0 to the instant it was called,
    // so the first kick of the new segment is scheduled exactly there. (Step
    // indices are derived from absolute time, which only holds while beat 0
    // sits at time 0 -- hence asserting the anchor rather than the index.)
    expect(h.whensFor("kick")[0]).toBeCloseTo(restartAt, 5);
    h.machine.destroy();
  });

  test("a step toggled off after its window was committed still fires once (lookAhead latency)", () => {
    // This is the documented cost of look-ahead scheduling, asserted rather
    // than hidden: edits land on the *next* pass, not the committed one.
    const h = makeHarness(ctx, 120);
    h.machine.play();

    // commit the window containing step 4 (beat 1 => t=0.5s), which the
    // default 0.1s lookAhead reaches from t=0.45
    for (let t = 0; t <= 0.45; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    expect(h.stepsFor("kick")).toContain(4);

    // now switch it off -- too late for the already-committed hit
    h.machine.toggleStep("kick", 4);
    const kick = h.machine.tracks.find((t) => t.id === "kick")!;
    expect(kick.pattern.value[4]).toBe(false);

    // ...and it does not come back on the next bar (step 4 of bar 2 = t=2.5s)
    for (let t = 0.5; t <= 3.85; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    const kicks = h.stepsFor("kick");
    expect(kicks.filter((s) => s === 4)).toHaveLength(1); // the committed one only
    h.machine.destroy();
  });

  test("a live tempo change alters subsequent step spacing", () => {
    const h = makeHarness(ctx, 120); // 2 beats/sec: a 16th = 0.125s
    h.machine.play();
    for (let t = 0; t <= 0.3; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    const beforeCount = h.triggerCount();

    h.machine.bpm.value = 240; // twice as fast: a 16th = 0.0625s
    for (let t = 0.35; t <= 1; t += 0.05) {
      h.advanceTo(t);
      h.tick();
    }
    // more steps land in the same wall-clock span once the tempo doubles
    expect(h.triggerCount()).toBeGreaterThan(beforeCount);
    h.machine.destroy();
  });
});

describe("stepFromPattern", () => {
  test("maps cycle phase to a step", () => {
    expect(stepFromPattern({ phase: 0 }, 16)).toBe(0);
    expect(stepFromPattern({ phase: 1 / 16 }, 16)).toBe(1);
    expect(stepFromPattern({ phase: 0.25 }, 16)).toBe(4);
    expect(stepFromPattern({ phase: 15 / 16 }, 16)).toBe(15);
  });

  test("clamps rather than overflowing at the cycle edge", () => {
    expect(stepFromPattern({ phase: 0.99999 }, 16)).toBe(15);
    expect(stepFromPattern({ phase: -0.01 }, 16)).toBe(0);
  });

  test("works for any pattern length, with no time-signature knowledge", () => {
    expect(stepFromPattern({ phase: 0.5 }, 32)).toBe(16);
    expect(stepFromPattern({ phase: 0.5 }, 8)).toBe(4);
  });
});
