import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createDrumKit } from "../src/audio/drumKit";
import type { DrumVoiceId } from "../src/audio/drumKit";

const VOICES: DrumVoiceId[] = ["kick", "snare", "hat", "clap"];

/** Peak absolute sample value. */
function peak(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]!));
  return max;
}

describe("createDrumKit", () => {
  let ctx: AudioContext;

  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });

  afterEach(() => {
    void ctx.close();
  });

  test("renders all four voices", () => {
    const kit = createDrumKit(ctx);
    for (const voice of VOICES) {
      expect(kit[voice], voice).toBeInstanceOf(AudioBuffer);
    }
  });

  test("every voice is audible (peak > 0.1) and free of NaN", () => {
    const kit = createDrumKit(ctx);
    for (const voice of VOICES) {
      const data = kit[voice].getChannelData(0);
      expect(peak(kit[voice]), voice).toBeGreaterThan(0.1);
      for (let i = 0; i < data.length; i++) {
        if (!Number.isFinite(data[i]!)) {
          throw new Error(`${voice} has a non-finite sample at ${i}`);
        }
      }
    }
  });

  test("no voice clips (peak <= 1)", () => {
    const kit = createDrumKit(ctx);
    for (const voice of VOICES) {
      expect(peak(kit[voice]), voice).toBeLessThanOrEqual(1);
    }
  });

  test("durations are in the expected drum-hit range", () => {
    const kit = createDrumKit(ctx);
    // kick is the longest, hat the shortest -- keeps the kit legible as a kit
    expect(kit.kick.duration).toBeCloseTo(0.35, 2);
    expect(kit.snare.duration).toBeCloseTo(0.2, 2);
    expect(kit.hat.duration).toBeCloseTo(0.08, 2);
    expect(kit.clap.duration).toBeCloseTo(0.15, 2);
    expect(kit.hat.duration).toBeLessThan(kit.kick.duration);
  });

  test("is deterministic — two kits render identical samples", () => {
    const a = createDrumKit(ctx);
    const b = createDrumKit(ctx);
    for (const voice of VOICES) {
      const da = a[voice].getChannelData(0);
      const db = b[voice].getChannelData(0);
      expect(da.length, voice).toBe(db.length);
      // spot-check across the buffer rather than all N samples
      for (let i = 0; i < da.length; i += Math.max(1, Math.floor(da.length / 64))) {
        expect(da[i], `${voice}@${i}`).toBe(db[i]);
      }
    }
  });

  test("energy decays — the tail is quieter than the onset", () => {
    const kit = createDrumKit(ctx);
    for (const voice of VOICES) {
      const data = kit[voice].getChannelData(0);
      const quarter = Math.floor(data.length / 4);
      let onset = 0;
      let tail = 0;
      for (let i = 0; i < quarter; i++) onset = Math.max(onset, Math.abs(data[i]!));
      for (let i = data.length - quarter; i < data.length; i++) tail = Math.max(tail, Math.abs(data[i]!));
      expect(tail, voice).toBeLessThan(onset);
    }
  });
});
