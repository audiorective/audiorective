import { describe, test, expect, beforeAll } from "vitest";
import { Analyser, AudioProcessor, createEngine } from "../src";

const ctx = new AudioContext();
beforeAll(async () => {
  await ctx.resume();
});

function waitUntil(time: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (ctx.currentTime > time) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

describe("Analyser", () => {
  test("is an AudioProcessor whose input and output are the same pass-through node", () => {
    const a = new Analyser(ctx, { fftSize: 256 });
    expect(a).toBeInstanceOf(AudioProcessor);
    expect(a.input).toBe(a.output);
    expect(a.input).toBeInstanceOf(AnalyserNode);
    a.destroy();
  });

  test("binCount is fftSize / 2; buffers are sized to match", () => {
    const a = new Analyser(ctx, { fftSize: 512 });
    expect(a.fftSize).toBe(512);
    expect(a.binCount).toBe(256);
    expect(a.createFrequencyBuffer().length).toBe(256);
    expect(a.createWaveformBuffer().length).toBe(512);
    a.destroy();
  });

  test("defaults to fftSize 2048", () => {
    const a = new Analyser(ctx);
    expect(a.fftSize).toBe(2048);
    expect(a.binCount).toBe(1024);
    a.destroy();
  });

  test("reads a live signal: an oscillator produces non-zero frequency magnitude", async () => {
    const osc = new OscillatorNode(ctx, { frequency: 440 });
    const a = new Analyser(ctx, { fftSize: 256, smoothingTimeConstant: 0 });
    osc.connect(a.input);
    // analyser is a pass-through; no need to reach the destination to analyse.
    osc.start();

    const bins = a.createFrequencyBuffer();
    await waitUntil(ctx.currentTime + 0.1);
    a.readFrequencies(bins);
    expect(Math.max(...bins)).toBeGreaterThan(0);

    const wave = a.createWaveformBuffer();
    a.readWaveform(wave);
    // Time-domain data swings away from the 128 silence midpoint.
    expect(Math.max(...wave)).toBeGreaterThan(128);

    osc.stop();
    osc.disconnect();
    a.destroy();
  });

  test("createEngine registers it for teardown (destroyed with the engine)", () => {
    const engine = createEngine((c) => ({ analyser: new Analyser(c) }));
    let disconnected = false;
    const node = engine.analyser.output;
    const orig = node.disconnect.bind(node);
    node.disconnect = ((...args: unknown[]) => {
      disconnected = true;
      return (orig as (...a: unknown[]) => void)(...args);
    }) as typeof node.disconnect;

    engine.core.destroy();
    expect(disconnected).toBe(true);
  });
});
