import { describe, expect, it, vi } from "vitest";
import { Convolver } from "../src";

describe("Convolver", () => {
  it("a unit-impulse IR is identity and flips isReady", async () => {
    const ctx = new OfflineAudioContext(1, 512, 44100);
    const ir = ctx.createBuffer(1, 1, 44100);
    ir.getChannelData(0)[0] = 1;
    const fx = new Convolver(ctx, { normalize: false });
    expect(fx.cells.isReady.value).toBe(false);
    fx.buffer = ir;
    expect(fx.cells.isReady.value).toBe(true);
    const src = new ConstantSourceNode(ctx, { offset: 0.5 });
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    src.start();
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(out[400]).toBeCloseTo(0.5, 4);
  });
  it("load(url) decodes through the shared cache", async () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const ir = ctx.createBuffer(1, 4, 44100);
    const core = await import("@audiorective/core");
    vi.spyOn(core.AudioBufferCache.prototype, "load").mockResolvedValue(ir);
    const fx = new Convolver(ctx, { url: "/ir.wav" });
    await fx.ready;
    expect(fx.buffer).toBe(ir);
    expect(fx.cells.isReady.value).toBe(true);
    vi.restoreAllMocks();
  });
  it("latest load(url) call wins over slower earlier calls", async () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const slowIr = ctx.createBuffer(1, 4, 44100);
    slowIr.getChannelData(0)[0] = 0.1;
    const fastIr = ctx.createBuffer(1, 4, 44100);
    fastIr.getChannelData(0)[0] = 0.9;
    const core = await import("@audiorective/core");
    vi.spyOn(core.AudioBufferCache.prototype, "load").mockImplementation((url) =>
      url === "/slow.wav" ? new Promise((r) => setTimeout(() => r(slowIr), 30)) : Promise.resolve(fastIr),
    );
    const fx = new Convolver(ctx);
    await Promise.all([fx.load("/slow.wav"), fx.load("/fast.wav")]);
    expect(fx.buffer).toBe(fastIr);
    vi.restoreAllMocks();
  });
});
