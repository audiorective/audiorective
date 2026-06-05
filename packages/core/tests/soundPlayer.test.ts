import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SoundPlayer } from "../src";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("SoundPlayer — trigger & polyphony", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode and volume param drives it", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx), volume: 0.5 });
    expect(p.output).toBeInstanceOf(AudioNode);
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.5);
    p.params.volume.value = 0.25;
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.25);
    p.destroy();
  });

  test("trigger with no buffer returns null", () => {
    const p = new SoundPlayer(ctx);
    expect(p.trigger()).toBeNull();
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("trigger spawns a voice and increments activeVoices", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    const v = p.trigger();
    expect(v).not.toBeNull();
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("polyphony 1 + steal 'oldest' restarts (count stays 1)", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 1, steal: "oldest" });
    p.trigger();
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    p.destroy();
  });

  test("polyphony 1 + steal 'none' drops the retrigger", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 1, steal: "none" });
    expect(p.trigger()).not.toBeNull();
    expect(p.trigger()).toBeNull();
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    p.destroy();
  });

  test("polyphony N overlaps up to N concurrent voices", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 3 });
    p.trigger();
    p.trigger();
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(3);
    p.trigger(); // steal oldest, still 3
    expect(p.cells.activeVoices.value).toBe(3);
    p.stopAll();
    p.destroy();
  });

  test("a voice that ends naturally is evicted from the pool", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 0.05), polyphony: 4 });
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(1);
    await delay(200);
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("buffer is hot-swappable for future triggers", () => {
    const p = new SoundPlayer(ctx);
    expect(p.trigger()).toBeNull();
    p.buffer = makeBuffer(ctx, 1);
    expect(p.trigger()).not.toBeNull();
    p.stopAll();
    p.destroy();
  });
});
