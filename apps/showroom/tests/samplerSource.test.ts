import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SamplerSource } from "../src/audio/sources/SamplerSource";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}

describe("SamplerSource", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode", () => {
    const s = new SamplerSource(ctx);
    expect(s.output).toBeInstanceOf(AudioNode);
    s.destroy();
  });

  test("trigger with no pad loaded returns null", () => {
    const s = new SamplerSource(ctx);
    expect(s.trigger("vfx1")).toBeNull();
    s.destroy();
  });

  test("setPadBuffer creates the pad on demand; trigger fires it", () => {
    const s = new SamplerSource(ctx);
    s.setPadBuffer("vfx1", makeBuffer(ctx, 1));
    expect(s.padIds).toEqual(["vfx1"]);
    expect(s.trigger("vfx1")).not.toBeNull();
    s.destroy();
  });

  test("supports an arbitrary set of pad ids", () => {
    const s = new SamplerSource(ctx);
    for (const id of ["vfx1", "vfx2", "vfx3"]) s.setPadBuffer(id, makeBuffer(ctx, 1));
    expect(s.padIds).toEqual(["vfx1", "vfx2", "vfx3"]);
    expect(s.trigger("vfx2")).not.toBeNull();
    expect(s.trigger("nope")).toBeNull();
    s.destroy();
  });
});
