import { afterEach, describe, expect, it } from "vitest";
import { createLandingEngine, type LandingEngine } from "../../src/components/landing/audio/setup";
import { MAX_CUTOFF, MAX_WET, MIN_CUTOFF, padToParams, paramsToPad } from "../../src/components/landing/audio/padCoordinates";

let engine: LandingEngine | undefined;
afterEach(async () => {
  if (engine) {
    await engine.stop();
    engine.core.destroy();
    engine = undefined;
  }
});

describe("landing session", () => {
  it("produces audio and preserves edits across pause and resume", async () => {
    engine = createLandingEngine();
    engine.machine.toggleStep("clap", 4);
    engine.filter.params.frequency.value = 2400;
    engine.delay.params.wet.value = 0.3;
    await engine.play();
    const spectrum = engine.analyser.createFrequencyBuffer();
    await expect
      .poll(() => {
        engine!.analyser.readFrequencies(spectrum);
        return Math.max(...spectrum);
      })
      .toBeGreaterThan(0);
    await engine.pause();
    expect(engine.core.context.state).toBe("suspended");
    expect(engine.machine.state.value).toBe("paused");
    await engine.play();
    expect(engine.machine.tracks.find((track) => track.id === "clap")!.pattern.value[4]).toBe(true);
    expect(engine.filter.params.frequency.value).toBeCloseTo(2400);
    expect(engine.delay.params.wet.value).toBeCloseTo(0.3);
    expect(engine.core.context.state).toBe("running");
  });

  it("settles overlapping playback requests to the last requested state", async () => {
    engine = createLandingEngine();
    await Promise.all([engine.play(), engine.pause()]);
    expect(engine.core.context.state).toBe("suspended");
    expect(engine.machine.state.value).not.toBe("playing");
    await Promise.all([engine.play(), engine.pause(), engine.play()]);
    expect(engine.core.context.state).toBe("running");
    expect(engine.machine.state.value).toBe("playing");
    await Promise.all([engine.pause(), engine.play(), engine.stop()]);
    expect(engine.core.context.state).toBe("suspended");
    expect(engine.machine.state.value).toBe("stopped");
  });
});

describe("sound field coordinates", () => {
  it("round trips the logarithmic frequency range and inverted wet axis", () => {
    for (const x of [0, 0.2, 0.5, 0.8, 1]) {
      for (const y of [0, 0.5, 1]) {
        const params = padToParams(x, y);
        const point = paramsToPad(params.frequency, params.wet);
        expect(point.x).toBeCloseTo(x);
        expect(point.y).toBeCloseTo(y);
      }
    }
    expect(padToParams(0.5, 0).frequency).toBeCloseTo(Math.sqrt(MIN_CUTOFF * MAX_CUTOFF));
  });

  it("clamps drags beyond the pad to safe parameter limits", () => {
    expect(padToParams(-2, -1)).toEqual({ frequency: MIN_CUTOFF, wet: MAX_WET });
    expect(padToParams(2, 3)).toEqual({ frequency: MAX_CUTOFF, wet: 0 });
    expect(paramsToPad(0, 2)).toEqual({ x: 0, y: 0 });
  });
});
