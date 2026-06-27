import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SchedulableParam } from "../src";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("SchedulableParam — rebind", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("value writes and read() follow the new AudioParam after rebind", () => {
    const a = new GainNode(ctx, { gain: 0 });
    const b = new GainNode(ctx, { gain: 0 });
    const p = new SchedulableParam({ default: 1, audioContext: ctx, audioParam: a.gain });
    expect(a.gain.value).toBeCloseTo(1); // default synced onto A

    p.rebind(b.gain);
    expect(b.gain.value).toBeCloseTo(1); // reassert (default) mirrors current value onto B

    p.value = 0.5;
    expect(b.gain.value).toBeCloseTo(0.5); // writes go to B
    expect(a.gain.value).toBeCloseTo(1); // A is left untouched
    expect(p.read()).toBeCloseTo(0.5); // read() reads B

    p.destroy();
  });

  test("rebind with reassert:false leaves the new param's value intact", () => {
    const a = new GainNode(ctx, { gain: 0 });
    const b = new GainNode(ctx, { gain: 0.3 });
    const p = new SchedulableParam({ default: 1, audioContext: ctx, audioParam: a.gain });
    p.rebind(b.gain, { reassert: false });
    expect(b.gain.value).toBeCloseTo(0.3);
    p.destroy();
  });

  test("scheduling after rebind automates the new param, not the old", async () => {
    const a = new GainNode(ctx, { gain: 0 });
    const b = new GainNode(ctx, { gain: 0 });
    b.connect(ctx.destination); // automation only renders for a node reaching destination
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: a.gain });
    p.rebind(b.gain);
    const t = ctx.currentTime;
    p.setValueAtTime(0, t).linearRampToValueAtTime(1, t + 0.05);
    await delay(120);
    expect(b.gain.value).toBeGreaterThan(0.5); // B ramped
    expect(a.gain.value).toBeCloseTo(0); // A never moved
    p.destroy();
  });

  test("stays a SchedulableParam — scheduling methods remain callable after rebind", () => {
    const a = new GainNode(ctx, { gain: 0 });
    const b = new GainNode(ctx, { gain: 0 });
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: a.gain });
    p.rebind(b.gain);
    expect(typeof p.setValueAtTime).toBe("function");
    expect(typeof p.exponentialRampToValueAtTime).toBe("function");
    expect(p.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01)).toBe(p); // chainable
    p.destroy();
  });
});
