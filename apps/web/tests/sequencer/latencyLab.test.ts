import { createEngine, type Sampler } from "@audiorective/core";
import { renderTimeline } from "@audiorective/clock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrumMachine } from "../../src/demos/sequencer/audio/DrumMachine";
import { createDrumKit } from "../../src/demos/sequencer/audio/drumKit";
import { createSequencerSetup } from "../../src/demos/sequencer/audio/setup";
import type { SequencerSetupOptions } from "../../src/demos/sequencer/audio/setup";

const SAMPLE_RATE = 48000;
const HIT_TIME = 0.05;
const THRESHOLD = 1e-4;

async function buildEngine(ctx: OfflineAudioContext, options?: SequencerSetupOptions) {
  const { setup, attach } = createSequencerSetup(options);
  const engine = createEngine(setup, { context: ctx as unknown as AudioContext });
  attach(engine.core);
  await engine.ready;
  if (!engine.lab.limiter) throw new Error("lab did not initialize");
  return { ...engine, limiter: engine.lab.limiter, ctx };
}

function kickOf(engine: Awaited<ReturnType<typeof buildEngine>>): Sampler {
  return engine.machine.tracks.find((t) => t.id === "kick")!.sampler;
}

/** One kick through the lab's root graph, triggered directly -- the routing under test, not the clock. */
async function renderLab(configure: (engine: Awaited<ReturnType<typeof buildEngine>>) => void) {
  const ctx = new OfflineAudioContext(2, SAMPLE_RATE * 1, SAMPLE_RATE);
  const engine = await buildEngine(ctx);
  configure(engine);
  kickOf(engine).trigger({ when: HIT_TIME });
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

/** The kick through a bare machine (no lab) — the exact waveform, master gain included, the dry/wet branches carry. */
async function renderSoloDryKick(): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, SAMPLE_RATE * 1, SAMPLE_RATE);
  const machine = new DrumMachine({ audioContext: ctx as unknown as AudioContext, kit: createDrumKit(ctx) });
  machine.output.connect(ctx.destination);
  machine.tracks.find((t) => t.id === "kick")!.sampler.trigger({ when: HIT_TIME });
  const rendered = await ctx.startRendering();
  machine.destroy();
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

describe("sequencer latency lab — root graph", () => {
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

  it("bypass on: the wet copy is gone entirely (no doubled dry) and the dry onset stays unshifted", async () => {
    const data = await renderLab((engine) => {
      engine.lab.limiterBypassed.value = true;
    });

    const hitIndex = Math.round(HIT_TIME * SAMPLE_RATE);
    expect(isSilentBefore(data, hitIndex)).toBe(true);
    expect(firstAboveThreshold(data)).toBe(hitIndex);

    // Bypass must not add a second split->master copy alongside dry->master —
    // subtracting the solo dry render should leave an all-zero residue, not a
    // doubled (+6 dB) signal.
    const dry = await renderSoloDryKick();
    const residue = Float32Array.from(data, (v, i) => v - (dry[i] ?? 0));
    for (const v of residue) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it("keeps engine.core.latency following the limiter's latency as it changes", async () => {
    const engine = await buildEngine(new OfflineAudioContext(2, SAMPLE_RATE * 1, SAMPLE_RATE));
    expect(engine.core.latency.value).toBe(engine.limiter.latency.value);

    const doubled = engine.limiter.latency.value * 2;
    engine.limiter.latency.value = doubled;

    expect(engine.core.latency.value).toBe(doubled);
  });
});

describe("sequencer latency lab — the whole machine rendered offline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderTimeline drives the machine's clock through the lab: a bar of kicks, the first landing at the limiter's latency", async () => {
    const bpm = 120; // a bar is 2 s; kicks on every beat at 0, 0.5, 1.0, 1.5
    let latency = 0;
    const scheduled: number[] = [];

    const rendered = await renderTimeline({ seconds: 2, channels: 2, sampleRate: SAMPLE_RATE }, async (ctx, tickSource) => {
      // the page's setup, verbatim, plus the one injection offline rendering needs
      const engine = await buildEngine(ctx, { tickSource });
      engine.machine.bpm.value = bpm;
      for (const track of engine.machine.tracks) track.mute.value = track.id !== "kick";
      // record the real trigger calls as the ticks fire mid-render, and let them through
      const kick = kickOf(engine);
      const trigger = kick.trigger.bind(kick);
      vi.spyOn(kick, "trigger").mockImplementation((opts) => {
        scheduled.push(opts?.when ?? ctx.currentTime);
        return trigger(opts);
      });
      latency = engine.limiter.latency.value;
      engine.machine.play();
    });

    // the four kicks of the bar, plus the next downbeat: the render stops at
    // 2 s, but the last window's look-ahead had already committed it
    expect(scheduled).toEqual([0, 0.5, 1.0, 1.5, 2.0]);

    // PDC on by default: the dry branch waits for the limited one, so beat 0
    // lands exactly `latency` samples in, and nothing sounds before it
    const data = rendered.getChannelData(0);
    expect(isSilentBefore(data, latency)).toBe(true);
    expect(firstAboveThreshold(data)).toBe(latency);
  });
});
