import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { makeImpulseResponse, createReverb } from "../src/audio/reverb";

describe("reverb", () => {
  let ctx: AudioContext;
  beforeEach(() => {
    ctx = new AudioContext();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("makeImpulseResponse builds a 2-channel buffer of the requested length", () => {
    const ir = makeImpulseResponse(ctx, 1, 3);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.length).toBe(Math.floor(1 * ctx.sampleRate));
  });

  test("createReverb returns a wired convolver with wet/dry gains", () => {
    const { convolver, wet, dry } = createReverb(ctx, { wet: 0.3, dry: 0.7 });
    expect(convolver).toBeInstanceOf(ConvolverNode);
    expect(convolver.buffer).not.toBeNull();
    expect(wet.gain.value).toBeCloseTo(0.3);
    expect(dry.gain.value).toBeCloseTo(0.7);
  });
});
