import { describe, test, expect, afterEach } from "vitest";
import { createPaEngine } from "../src/audio/engine";

describe("PA engine assembly", () => {
  let teardown: (() => void) | null = null;
  afterEach(() => {
    teardown?.();
    teardown = null;
  });

  test("builds five channels, a mixer, and shared state", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    expect(engine.channels).toHaveLength(5);
    expect(engine.mixer.channels).toBe(engine.channels);
    expect(engine.selectedChannelId.value).toBe(engine.channels[0].id);
    expect(engine.ui.value.hudOpen).toBe(false);
    expect(engine.sampler).not.toBeNull();
  });

  test("start() flips the transport to playing; stop() clears it", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    engine.start();
    expect(engine.transport.params.playing.value).toBe(true);
    engine.stop();
    expect(engine.transport.params.playing.value).toBe(false);
  });

  test("headphone toggle is reachable via the mixer", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    engine.mixer.params.headphone.value = true;
    await new Promise((r) => setTimeout(r, 60));
    expect(engine.mixer.phonesBusGain).toBeGreaterThan(0.95);
  });
});
