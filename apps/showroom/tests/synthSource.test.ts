import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MasterSequencer } from "../src/examples/sequencer/audio/MasterSequencer";
import { SynthSource } from "../src/audio/sources/SynthSource";

describe("SynthSource", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode", () => {
    const transport = new MasterSequencer(ctx);
    const s = new SynthSource(ctx, transport);
    expect(s.output).toBeInstanceOf(AudioNode);
    s.destroy();
    transport.destroy();
  });

  test("plays through the transport without throwing", () => {
    const transport = new MasterSequencer(ctx);
    const s = new SynthSource(ctx, transport);
    transport.start();
    expect(transport.params.playing.value).toBe(true);
    transport.stop();
    s.destroy();
    transport.destroy();
  });
});
