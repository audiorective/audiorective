import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SamplerSource, PAD_IDS } from "../src/audio/sources/SamplerSource";

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

  test("trigger with no buffer loaded returns null", () => {
    const s = new SamplerSource(ctx);
    expect(s.trigger("boom")).toBeNull();
    s.destroy();
  });

  test("trigger after setPadBuffer returns a Voice", () => {
    const s = new SamplerSource(ctx);
    s.setPadBuffer("boom", makeBuffer(ctx, 1));
    expect(s.trigger("boom")).not.toBeNull();
    s.destroy();
  });

  test("startBed loops the bed buffer", () => {
    const s = new SamplerSource(ctx);
    s.setBedBuffer(makeBuffer(ctx, 2));
    s.startBed();
    expect(s.bedActiveVoices).toBe(1);
    s.stopBed();
    s.destroy();
  });

  test("PAD_IDS has the four expected pads", () => {
    expect(PAD_IDS).toEqual(["boom", "riser", "airhorn", "applause"]);
  });
});
