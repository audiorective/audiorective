import { describe, expect, it } from "vitest";
import { Channel, SendBus } from "../src";

async function renderStereo(build: (ctx: OfflineAudioContext) => void, frames = 256) {
  const ctx = new OfflineAudioContext(2, frames, 44100);
  build(ctx);
  return ctx.startRendering();
}

describe("Channel", () => {
  it("gain scales, mute silences, unmute restores", async () => {
    const buf = await renderStereo((ctx) => {
      const ch = new Channel(ctx, { gain: 0.5 });
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      ch.output.connect(ctx.destination);
      src.start();
      ch.params.mute.value = true;
      ctx.suspend(128 / 44100).then(() => {
        ch.params.mute.value = false;
        ctx.resume();
      });
    });
    const l = buf.getChannelData(0);
    expect(l[64]).toBeCloseTo(0, 6);
    expect(l[250]).toBeCloseTo(0.5, 6);
  });

  it("pan = 1 puts a mono source in the right channel only", async () => {
    const buf = await renderStereo((ctx) => {
      const ch = new Channel(ctx, { pan: 1 });
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      ch.output.connect(ctx.destination);
      src.start();
    });
    expect(buf.getChannelData(0)[200]).toBeCloseTo(0, 5);
    expect(buf.getChannelData(1)[200]).toBeGreaterThan(0.9);
  });

  it("a send delivers the post-mute signal at its own gain", async () => {
    let tapped!: Float32Array;
    const buf = await renderStereo((ctx) => {
      const bus = new SendBus(ctx);
      bus.define("hall");
      const ch = new Channel(ctx);
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      src.start();
      const send = ch.send(bus, "hall", 0.5);
      expect(send.gain.value).toBe(0.5);
      bus.receive("hall").connect(ctx.destination); // only the send reaches the output
    });
    tapped = buf.getChannelData(0);
    expect(tapped[200]).toBeCloseTo(0.5, 5);
  });

  it("SendBus.receive throws for an undefined name", () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const bus = new SendBus(ctx);
    expect(() => bus.receive("nope")).toThrow(/nope/);
  });

  it("a disposed send delivers nothing", async () => {
    const buf = await renderStereo((ctx) => {
      const bus = new SendBus(ctx);
      bus.define("hall");
      const ch = new Channel(ctx);
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      src.start();
      const send = ch.send(bus, "hall", 0.5);
      send.dispose();
      expect(() => send.dispose()).not.toThrow();
      bus.receive("hall").connect(ctx.destination);
    });
    expect(buf.getChannelData(0)[200]).toBeCloseTo(0, 6);
  });
});
