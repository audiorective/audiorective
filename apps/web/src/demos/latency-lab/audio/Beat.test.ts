import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { Beat } from "./Beat";

describe("Beat", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = new AudioContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it("triggers the fixed kick/snare/hat pattern on schedule and records hits", () => {
    const kit = createDrumKit(ctx);
    const beat = new Beat(ctx, { kit });

    const kickSpy = vi.spyOn(beat.samplers.kick, "trigger");
    const snareSpy = vi.spyOn(beat.samplers.snare, "trigger");
    const hatSpy = vi.spyOn(beat.samplers.hat, "trigger");

    // Fake window: 16 steps at time = step * 0.125, ignoring the requested division.
    const grid = Array.from({ length: 16 }, (_, step) => ({ time: step * 0.125, step }));
    const window = { rulers: { pattern: { grid: () => grid } } };

    beat.schedule(window);

    expect(kickSpy).toHaveBeenCalledTimes(4);
    expect(snareSpy).toHaveBeenCalledTimes(2);
    expect(hatSpy).toHaveBeenCalledTimes(4);

    expect(beat.hits.value).toEqual(
      expect.arrayContaining([
        { voice: "kick", time: 0 },
        { voice: "kick", time: 0.5 },
        { voice: "kick", time: 1 },
        { voice: "kick", time: 1.5 },
        { voice: "snare", time: 0.5 },
        { voice: "snare", time: 1.5 },
        { voice: "hat", time: 0.25 },
        { voice: "hat", time: 0.75 },
        { voice: "hat", time: 1.25 },
        { voice: "hat", time: 1.75 },
      ]),
    );
    expect(beat.hits.value).toHaveLength(10);
  });

  it("constructs and schedules against an OfflineAudioContext — the offline path graph.test.ts's headless render relies on", () => {
    const offlineCtx = new OfflineAudioContext(1, 1, 44100);
    const kit = createDrumKit(offlineCtx);
    const beat = new Beat(offlineCtx, { kit });

    const grid = Array.from({ length: 16 }, (_, step) => ({ time: step * 0.125, step }));
    const window = { rulers: { pattern: { grid: () => grid } } };

    expect(() => beat.schedule(window)).not.toThrow();
  });
});
