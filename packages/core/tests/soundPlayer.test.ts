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

  test("stopAll(when) in the future keeps cells consistent until the stop fires", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 5), polyphony: 2 });
    p.trigger();
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(2);

    // Let the audio render thread tick so ctx.currentTime > 0 before scheduling a future stop.
    await delay(20);
    p.stopAll(ctx.currentTime + 0.08);
    // Still audibly playing during the window — cells reflect reality, not eagerly cleared.
    expect(p.cells.isPlaying.value).toBe(true);
    expect(p.cells.activeVoices.value).toBe(2);

    await delay(400);
    expect(p.cells.activeVoices.value).toBe(0);
    expect(p.cells.isPlaying.value).toBe(false);
    p.destroy();
  });
});

describe("SoundPlayer — transport", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("play starts the current voice and sets isPlaying", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    const v = p.play();
    expect(v).not.toBeNull();
    expect(p.cells.isPlaying.value).toBe(true);
    expect(p.cells.activeVoices.value).toBe(1);
    p.stop();
    p.destroy();
  });

  test("play is a no-op while already playing (same voice, no new voice)", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    const v1 = p.play();
    const v2 = p.play();
    expect(v2).toBe(v1);
    expect(p.cells.activeVoices.value).toBe(1);
    p.stop();
    p.destroy();
  });

  test("pause then play resumes the same voice and continues", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 3) });
    const v1 = p.play();
    await delay(120);
    p.pause();
    expect(p.cells.isPlaying.value).toBe(false);
    const at = p.currentTime;
    const v2 = p.play();
    expect(v2).toBe(v1); // resumed, not a fresh voice
    expect(p.cells.isPlaying.value).toBe(true);
    await delay(120);
    expect(p.currentTime).toBeGreaterThan(at + 0.05);
    p.stop();
    p.destroy();
  });

  test("stop then play starts fresh from 0", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 3) });
    p.play();
    await delay(120);
    p.stop();
    expect(p.cells.isPlaying.value).toBe(false);
    expect(p.currentTime).toBe(0);
    p.play();
    expect(p.currentTime).toBeLessThan(0.08); // restarted near 0
    p.stop();
    p.destroy();
  });

  test("seek moves the current voice position", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 5) });
    p.play();
    p.seek(3);
    expect(p.currentTime).toBeGreaterThan(2.9);
    expect(p.currentTime).toBeLessThan(3.3);
    p.stop();
    p.destroy();
  });

  test("isPlaying flips back to false when the voice ends naturally", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 0.05) });
    p.play();
    expect(p.cells.isPlaying.value).toBe(true);
    await delay(200);
    expect(p.cells.isPlaying.value).toBe(false);
    expect(p.currentTime).toBe(0);
    p.destroy();
  });
});
