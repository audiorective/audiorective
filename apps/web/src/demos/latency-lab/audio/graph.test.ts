import { createEngine, Sampler } from "@audiorective/core";
import { describe, expect, it } from "vitest";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { createLabSetup } from "./engine";

const SAMPLE_RATE = 48000;
const HIT_TIME = 0.05;
const THRESHOLD = 1e-4;

async function renderLab(configure: (engine: Awaited<ReturnType<typeof buildEngine>>) => void) {
  const engine = await buildEngine();
  configure(engine);
  engine.beat.samplers.kick.trigger({ when: HIT_TIME });
  const rendered = await engine.ctx.startRendering();
  return rendered.getChannelData(0);
}

async function buildEngine() {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * 1, SAMPLE_RATE);
  const { setup, attach } = createLabSetup();
  const engine = createEngine(setup, { context: ctx as unknown as AudioContext });
  attach(engine.core);
  await engine.ready;
  if (!engine.lab.limiter) throw new Error("lab did not initialize");
  return { ...engine, limiter: engine.lab.limiter, ctx };
}

/** The raw kick, rendered alone (no Lab) — the exact waveform the dry/wet branches carry. */
async function renderSoloDryKick(): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE * 1, SAMPLE_RATE);
  const kit = createDrumKit(ctx);
  const sampler = new Sampler(ctx, { buffer: kit.kick });
  sampler.output.connect(ctx.destination);
  sampler.trigger({ when: HIT_TIME });
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

function firstAboveThreshold(data: Float32Array, threshold = THRESHOLD): number {
  return data.findIndex((v) => Math.abs(v) > threshold);
}

function isSilentBefore(data: Float32Array, index: number, threshold = THRESHOLD): boolean {
  for (let i = 0; i < index; i++) {
    if (Math.abs(data[i]) > threshold) return false;
  }
  return true;
}

describe("latency-lab root graph", () => {
  it("PDC on: the dry branch is compensated to align with the limited branch — one onset, at hitTime + limiter latency", async () => {
    let latency = 0;
    const data = await renderLab((engine) => {
      latency = engine.limiter.latency.value;
    });

    const hitIndex = Math.round(HIT_TIME * SAMPLE_RATE);
    const expected = hitIndex + latency;

    expect(isSilentBefore(data, expected)).toBe(true);
    expect(firstAboveThreshold(data)).toBe(expected);
  });

  it("PDC off: the dry branch is unshifted and the limited branch arrives its own latency later", async () => {
    let latency = 0;
    const data = await renderLab((engine) => {
      engine.lab.setPdc(false);
      latency = engine.limiter.latency.value;
    });

    const hitIndex = Math.round(HIT_TIME * SAMPLE_RATE);
    const wetIndex = hitIndex + latency;

    // The dry onset lands exactly on the raw trigger time — no compensation applied.
    expect(isSilentBefore(data, hitIndex)).toBe(true);
    expect(firstAboveThreshold(data)).toBe(hitIndex);

    // Isolate the wet branch by subtracting the known dry-only waveform (linear
    // mixing means this cancels the dry contribution exactly, leaving only what
    // the limiter path added) — the kick's own decaying, oscillating envelope
    // never actually goes silent, so a raw silence-gap scan can't tell the two
    // branches apart on its own.
    const dry = await renderSoloDryKick();
    const wetOnly = Float32Array.from(data, (v, i) => v - (dry[i] ?? 0));

    expect(isSilentBefore(wetOnly, wetIndex)).toBe(true);
    expect(firstAboveThreshold(wetOnly)).toBe(wetIndex);
  });

  it("bypass on: the wet copy is gone and the dry onset keeps PDC's zero-diff position — no shift", async () => {
    const data = await renderLab((engine) => {
      engine.lab.limiterBypassed.value = true;
    });

    const hitIndex = Math.round(HIT_TIME * SAMPLE_RATE);
    expect(isSilentBefore(data, hitIndex)).toBe(true);
    expect(firstAboveThreshold(data)).toBe(hitIndex);
  });

  it("keeps engine.core.latency following the limiter's latency as it changes", async () => {
    const engine = await buildEngine();
    expect(engine.core.latency.value).toBe(engine.limiter.latency.value);

    const doubled = engine.limiter.latency.value * 2;
    engine.limiter.latency.value = doubled;

    expect(engine.core.latency.value).toBe(doubled);
  });
});
