import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { DrumMachine } from "../src/audio/DrumMachine";
import { createDrumKit } from "../src/audio/drumKit";
import type { DrumVoiceId } from "../src/audio/drumKit";

/**
 * Poll rather than sleep: this runs on the real WorkerTickSource against a
 * real AudioContext, so under CPU load a fixed wait is flaky. Mirrors the
 * showroom/clock convention.
 */
async function waitFor(predicate: () => boolean, timeout = 5000, step = 25): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, step));
  }
}

describe("step sequencer smoke (real AudioContext + WorkerTickSource)", () => {
  let ctx: AudioContext;

  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });

  afterEach(() => void ctx.close());

  test("the default pattern plays: kick lands on every downbeat, in order", async () => {
    const scheduled: Array<{ trackId: DrumVoiceId; step: number; time: number }> = [];
    const machine = new DrumMachine({
      audioContext: ctx,
      kit: createDrumKit(ctx),
      bpm: 240, // a bar every second, so the test stays quick
      onStepScheduled: (trackId, step, time) => scheduled.push({ trackId, step, time }),
    });

    machine.play();
    const kicks = () => scheduled.filter((s) => s.trackId === "kick");
    await waitFor(() => kicks().length >= 4);
    machine.pause();

    const first4 = kicks().slice(0, 4);
    expect(first4.map((k) => k.step)).toEqual([0, 4, 8, 12]);
    for (let i = 1; i < first4.length; i++) {
      expect(first4[i]!.time).toBeGreaterThan(first4[i - 1]!.time);
    }

    // and the other voices came along for the ride
    expect(scheduled.some((s) => s.trackId === "snare")).toBe(true);
    expect(scheduled.some((s) => s.trackId === "hat")).toBe(true);
    expect(scheduled.some((s) => s.trackId === "clap")).toBe(false); // empty by default

    machine.destroy();
  });

  test("the bar ruler's reactive current advances while playing", async () => {
    const machine = new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx), bpm: 240 });
    const startBeat = machine.currentBar.value.beatInBar;

    machine.play();
    // this is the exact surface the UI's playhead reads
    await waitFor(() => machine.currentBar.value.beatInBar !== startBeat);
    expect(machine.currentBar.value.beatInBar).not.toBe(startBeat);

    machine.destroy();
  });
});
