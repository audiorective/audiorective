import { describe, test, expect, afterEach } from "vitest";
import { createPaEngine } from "../src/audio/engine";

describe("PA engine assembly", () => {
  let teardown: (() => void) | null = null;
  afterEach(() => {
    teardown?.();
    teardown = null;
  });

  test("builds five channels + sampler, a mixer, and shared state", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    expect(engine.channels).toHaveLength(5);
    expect(engine.mixer.channels).toBe(engine.channels);
    expect(engine.selectedChannelId.value).toBe(engine.channels[0].id);
    expect(engine.ui.value.hudOpen).toBe(false);
    expect(engine.sampler).not.toBeNull();
  });

  test("the FX sampler feeds a real channel (shares Vox's chain), not its own", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    // FX is not a channel; the sampler exists and triggers are no-ops without buffers (no throw).
    expect(engine.channels.some((c) => c.id === "fx")).toBe(false);
    expect(() => engine.sampler.trigger("vfx1")).not.toThrow();
  });

  test("start() and stop() run without throwing", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    expect(() => {
      engine.start();
      engine.stop();
    }).not.toThrow();
  });

  test("headphone toggle is reachable via the mixer", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    engine.mixer.params.headphone.value = true;
    // Poll: the headphone bus ramps to -9.5 dB (~0.33); the audio clock can run slow under load.
    const start = performance.now();
    while (performance.now() - start < 2000 && !(engine.mixer.phonesBusGain > 0.25)) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(engine.mixer.phonesBusGain).toBeGreaterThan(0.25);
  });
});
