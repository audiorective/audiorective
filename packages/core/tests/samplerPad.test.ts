import { describe, test, expect } from "vitest";
import { effect } from "alien-signals";
import { Sampler, Voice, reverseBuffer } from "../src";
import { reverseRegion } from "../src/reverseBuffer";

const RATE = 44100;

/** A mono buffer whose samples are a ramp 0..1, so a slice identifies its position. */
function rampBuffer(ctx: BaseAudioContext, samples: number): AudioBuffer {
  const buf = ctx.createBuffer(1, samples, RATE);
  const data = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = i / samples;
  return buf;
}

function dcBuffer(ctx: BaseAudioContext, samples: number, value = 1): AudioBuffer {
  const buf = ctx.createBuffer(1, samples, RATE);
  buf.getChannelData(0).fill(value);
  return buf;
}

async function render(samples: number, setup: (oac: OfflineAudioContext) => void | Promise<void>): Promise<Float32Array> {
  const oac = new OfflineAudioContext(1, samples, RATE);
  await setup(oac);
  return (await oac.startRendering()).getChannelData(0);
}

function expectClose(actual: Float32Array, expected: Float32Array, from: number, to: number, tolerance = 1e-4): void {
  for (let i = from; i < to; i++) {
    if (Math.abs(actual[i]! - expected[i]!) > tolerance) {
      throw new Error(`sample ${i}: got ${actual[i]}, want ${expected[i]}`);
    }
  }
}

describe("Sampler — reverse", () => {
  test("a region is the same slice of the forward buffer, played backwards", async () => {
    const offset = 100 / RATE;
    const duration = 300 / RATE;
    const out = await render(1000, (oac) => {
      const s = new Sampler(oac, { buffer: rampBuffer(oac, 1000), reverse: true });
      s.output.connect(oac.destination);
      s.trigger({ when: 0, offset, duration });
    });
    const forward = rampBuffer(new OfflineAudioContext(1, 1, RATE), 1000).getChannelData(0);
    const expected = new Float32Array(1000);
    for (let i = 0; i < 300; i++) expected[i] = forward[100 + 299 - i]!;
    expectClose(out, expected, 0, 300);
    expect(out[300]).toBe(0);
  });

  test("a region without duration runs from the offset to the end, backwards", async () => {
    const out = await render(1000, (oac) => {
      const s = new Sampler(oac, { buffer: rampBuffer(oac, 1000), reverse: true });
      s.output.connect(oac.destination);
      s.trigger({ when: 0, offset: 600 / RATE });
    });
    const forward = rampBuffer(new OfflineAudioContext(1, 1, RATE), 1000).getChannelData(0);
    const expected = new Float32Array(1000);
    for (let i = 0; i < 400; i++) expected[i] = forward[999 - i]!;
    expectClose(out, expected, 0, 400);
    expect(out[400]).toBe(0);
  });

  test("a reversed whole-buffer loop keeps looping", async () => {
    const out = await render(1000, (oac) => {
      const s = new Sampler(oac, { buffer: rampBuffer(oac, 200), reverse: true, loop: true });
      s.output.connect(oac.destination);
      s.trigger({ when: 0, offset: 50 / RATE });
    });
    // the entry point mirrors the offset: 50 samples in from the front becomes 50 from the end
    expect(out[0]).toBeCloseTo(49 / 200, 3);
    // still sounding well past one buffer length, and still descending through each pass
    expect(out[850]).toBeGreaterThan(0);
    expect(out[850]).toBeGreaterThan(out[851]!);
  });

  test("swapping the buffer drops the cached reversed copy", async () => {
    const out = await render(200, (oac) => {
      const s = new Sampler(oac, { buffer: dcBuffer(oac, 200, 0.25), reverse: true });
      s.output.connect(oac.destination);
      s.buffer = dcBuffer(oac, 200, 0.75);
      s.trigger({ when: 0 });
    });
    expect(out[50]).toBeCloseTo(0.75, 5);
  });
});

describe("Sampler — mute", () => {
  test("mute silences without touching queued volume automation", async () => {
    const out = await render(400, (oac) => {
      const s = new Sampler(oac, { buffer: dcBuffer(oac, 400), mute: true });
      s.output.connect(oac.destination);
      s.params.volume.setValueAtTime(0.5, 100 / RATE);
      s.trigger({ when: 0 });
      void oac.suspend(256 / RATE).then(() => {
        s.params.mute.value = false;
        void oac.resume();
      });
    });
    expect(out[50]).toBe(0); // muted
    expect(out[200]).toBe(0); // still muted after the volume step
    expect(out[300]).toBeCloseTo(0.5, 5); // unmuted: the scheduled 0.5 is in force
  });
});

describe("Sampler — pad retrigger", () => {
  test("activeVoices never dips to 0 when polyphony 1 steals", () => {
    const oac = new OfflineAudioContext(1, 1000, RATE);
    const s = new Sampler(oac, { buffer: dcBuffer(oac, 1000), polyphony: 1 });
    const seen: number[] = [];
    effect(() => {
      seen.push(s.cells.activeVoices.value);
    });
    s.trigger();
    s.trigger();
    s.trigger();
    expect(seen[0]).toBe(0);
    expect(seen.slice(1)).not.toContain(0);
    expect(Math.max(...seen)).toBe(1);
    expect(s.cells.activeVoices.value).toBe(1);
    s.stopAll();
    expect(s.cells.activeVoices.value).toBe(0);
  });

  test("a stolen hit fades out while the new one starts at full level", async () => {
    const fade = 100 / RATE;
    const out = await render(600, (oac) => {
      const s = new Sampler(oac, { buffer: dcBuffer(oac, 600), polyphony: 1, fadeOut: fade });
      s.output.connect(oac.destination);
      s.trigger({ when: 0 });
      void oac.suspend(256 / RATE).then(() => {
        s.trigger();
        void oac.resume();
      });
    });
    expect(out[100]).toBeCloseTo(1, 5);
    // during the fade both play: 1 (new) + the old ramping 1 -> 0
    expect(out[256 + 50]).toBeGreaterThan(1.2);
    expect(out[256 + 50]).toBeLessThan(1.8);
    // after the fade only the new hit remains
    expect(out[256 + 150]).toBeCloseTo(1, 3);
  });
});

describe("Voice — fades", () => {
  test("fadeIn ramps from silence to volume over the fade", async () => {
    const out = await render(400, (oac) => {
      new Voice(oac, dcBuffer(oac, 400), oac.destination, { when: 0, fadeIn: 200 / RATE, volume: 0.8 }, () => {});
    });
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[100]).toBeCloseTo(0.4, 2);
    expect(out[300]).toBeCloseTo(0.8, 3);
  });

  test("an immediate stop with fadeOut finishes the voice now and rings out", async () => {
    let endedAt: number | null = null;
    let playingAfterStop: boolean | null = null;
    const out = await render(600, (oac) => {
      const v = new Voice(oac, dcBuffer(oac, 600), oac.destination, { when: 0, fadeOut: 100 / RATE }, () => {});
      v.onEnded(() => {
        endedAt = oac.currentTime;
      });
      void oac.suspend(256 / RATE).then(() => {
        v.stop();
        playingAfterStop = v.isPlaying;
        void oac.resume();
      });
    });
    expect(playingAfterStop).toBe(false);
    expect(endedAt).toBeCloseTo(256 / RATE, 4);
    expect(out[200]).toBeCloseTo(1, 5);
    expect(out[256 + 50]).toBeGreaterThan(0.3);
    expect(out[256 + 50]).toBeLessThan(0.7);
    expect(out[256 + 120]).toBe(0);
  });

  test("a scheduled stop(when) with fadeOut fades from `when` and finalizes once", async () => {
    let ended = 0;
    const out = await render(800, (oac) => {
      const v = new Voice(oac, dcBuffer(oac, 800), oac.destination, { when: 0, fadeOut: 100 / RATE }, () => {
        ended++;
      });
      v.stop(300 / RATE);
    });
    expect(out[299]).toBeCloseTo(1, 3);
    expect(out[350]).toBeGreaterThan(0.3);
    expect(out[350]).toBeLessThan(0.7);
    expect(out[450]).toBe(0);
    expect(ended).toBe(1);
  });

  test("a stop scheduled inside the fade-in fades from the level reached at `when`", async () => {
    const out = await render(400, (oac) => {
      const v = new Voice(oac, dcBuffer(oac, 400), oac.destination, { when: 0, fadeIn: 200 / RATE, fadeOut: 100 / RATE }, () => {});
      v.stop(100 / RATE);
    });
    expect(out[50]).toBeCloseTo(0.25, 2); // fade-in still runs up to `when`
    expect(out[100]).toBeCloseTo(0.5, 2); // level reached at `when`
    expect(out[150]).toBeCloseTo(0.25, 2); // halfway through the fade-out
    expect(out[250]).toBe(0);
  });

  test("without fades a unity voice still adds no gain node", () => {
    const oac = new OfflineAudioContext(1, 10, RATE);
    const spy = { count: 0 };
    const orig = oac.createGain.bind(oac);
    oac.createGain = () => {
      spy.count++;
      return orig();
    };
    new Voice(oac, dcBuffer(oac, 10), oac.destination, {}, () => {});
    expect(spy.count).toBe(0);
  });
});

describe("reverseRegion", () => {
  test("whole buffer maps to whole buffer", () => {
    expect(reverseRegion(0, undefined, 1)).toEqual({ offset: 0, duration: 1 });
  });
  test("a region measured from the original start lands at the mirrored position", () => {
    expect(reverseRegion(0.2, 0.3, 1)).toEqual({ offset: 0.5, duration: 0.3 });
  });
  test("a duration past the end is clamped to the buffer", () => {
    const r = reverseRegion(0.8, 5, 1);
    expect(r.offset).toBe(0);
    expect(r.duration).toBeCloseTo(0.2, 10);
  });
  test("an offset past the end yields an empty region", () => {
    expect(reverseRegion(2, 0.5, 1)).toEqual({ offset: 0, duration: 0 });
  });
});

describe("reverseBuffer", () => {
  test("reverses every channel and leaves the source untouched", () => {
    const ctx = new OfflineAudioContext(2, 8, 48000);
    const src = ctx.createBuffer(2, 4, 48000);
    src.getChannelData(0).set([1, 2, 3, 4]);
    src.getChannelData(1).set([5, 6, 7, 8]);
    const out = reverseBuffer(src);
    expect(out.sampleRate).toBe(48000);
    expect(Array.from(out.getChannelData(0))).toEqual([4, 3, 2, 1]);
    expect(Array.from(out.getChannelData(1))).toEqual([8, 7, 6, 5]);
    expect(Array.from(src.getChannelData(0))).toEqual([1, 2, 3, 4]);
  });
});
