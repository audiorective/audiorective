import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { BufferPlayer } from "../src";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("BufferPlayer", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode and volume param drives it", () => {
    const p = new BufferPlayer(ctx, { buffer: makeBuffer(ctx), volume: 0.5 });
    expect(p.output).toBeInstanceOf(AudioNode);
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.5);
    p.params.volume.value = 0.25;
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.25);
    p.destroy();
  });

  test("start() sets isPlaying; stop() clears it", () => {
    const p = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    expect(p.cells.isPlaying.value).toBe(false);
    p.start();
    expect(p.cells.isPlaying.value).toBe(true);
    p.stop();
    expect(p.cells.isPlaying.value).toBe(false);
    p.destroy();
  });

  test("start() with no buffer is a no-op", () => {
    const p = new BufferPlayer(ctx);
    p.start();
    expect(p.cells.isPlaying.value).toBe(false);
    p.destroy();
  });

  test("start() while already playing is a guarded no-op", () => {
    const p = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    p.start();
    expect(() => p.start()).not.toThrow();
    expect(p.cells.isPlaying.value).toBe(true);
    p.stop();
    p.destroy();
  });

  test("rate is a SchedulableParam whose ramp automates the live source", async () => {
    const p = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    p.output.connect(ctx.destination); // source must reach destination for playbackRate to render
    p.start();
    expect(p.params.rate.read()).toBeCloseTo(1);
    const t = ctx.currentTime;
    p.params.rate
      .cancelScheduledValues(t)
      .setValueAtTime(p.params.rate.read(), t)
      .exponentialRampToValueAtTime(0.1, t + 0.05);
    await delay(150);
    expect(p.params.rate.read()).toBeLessThan(0.5); // spun down on the real source
    p.stop();
    p.destroy();
  });

  test("restart re-anchors rate to base and rebinds to a fresh source", async () => {
    const p = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 2), playbackRate: 1 });
    p.output.connect(ctx.destination);
    p.start();
    const t = ctx.currentTime;
    p.params.rate.setValueAtTime(1, t).exponentialRampToValueAtTime(0.1, t + 0.05);
    await delay(120);
    expect(p.params.rate.read()).toBeLessThan(0.5);
    p.stop();

    p.start(); // fresh source
    expect(p.params.rate.read()).toBeCloseTo(1); // re-anchored to base, not the spun-down 0.1
    const t2 = ctx.currentTime;
    p.params.rate.setValueAtTime(1, t2).exponentialRampToValueAtTime(0.1, t2 + 0.05);
    await delay(120);
    expect(p.params.rate.read()).toBeLessThan(0.5); // new source automates too
    p.stop();
    p.destroy();
  });

  test("a looping player keeps playing past buffer length; non-looping ends", async () => {
    const looping = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 0.05), loop: true });
    looping.start();
    await delay(200);
    expect(looping.cells.isPlaying.value).toBe(true);
    looping.stop();
    looping.destroy();

    const once = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 0.05) });
    once.start();
    await delay(200);
    expect(once.cells.isPlaying.value).toBe(false); // ended naturally
    once.destroy();
  });

  test("destroy() does not throw", () => {
    const p = new BufferPlayer(ctx, { buffer: makeBuffer(ctx, 1) });
    p.start();
    expect(() => p.destroy()).not.toThrow();
  });
});
