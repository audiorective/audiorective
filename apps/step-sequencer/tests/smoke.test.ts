import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
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

  afterEach(() => {
    vi.restoreAllMocks();
    void ctx.close();
  });

  test("the default pattern plays: kick lands on every downbeat, in order", async () => {
    const bpm = 240; // a bar every second, so the test stays quick
    const machine = new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx), bpm });
    // wire it exactly as the app does, so the smoke test really makes sound
    machine.output.connect(ctx.destination);

    // Spy the real Sampler call rather than a test hook: this asserts the audio
    // the machine actually scheduled, which a parallel callback could not.
    const spyFor = (id: DrumVoiceId) => vi.spyOn(machine.tracks.find((t) => t.id === id)!.sampler, "trigger");
    const kick = spyFor("kick");
    const snare = spyFor("snare");
    const hat = spyFor("hat");
    const clap = spyFor("clap");

    machine.play();
    await waitFor(() => kick.mock.calls.length >= 4);
    machine.pause();

    const whens = kick.mock.calls.slice(0, 4).map((c) => c[0]!.when!);
    for (let i = 1; i < whens.length; i++) {
      expect(whens[i]!).toBeGreaterThan(whens[i - 1]!);
      // four-on-the-floor at 240bpm is one kick per beat: 0.25s apart
      expect(whens[i]! - whens[i - 1]!).toBeCloseTo(60 / bpm, 3);
    }

    // and the other voices came along for the ride
    expect(snare.mock.calls.length).toBeGreaterThan(0);
    expect(hat.mock.calls.length).toBeGreaterThan(0);
    expect(clap.mock.calls.length).toBe(0); // empty by default

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
