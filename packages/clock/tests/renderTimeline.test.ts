import { describe, expect, test } from "vitest";
import { Sampler } from "@audiorective/core";
import { Clock } from "../src/Clock";
import type { MissedGap, TickWindow } from "../src/Clock";
import { Timeline } from "../src/Timeline";
import { LinearBarRuler } from "../src/rulers/LinearBarRuler";
import { renderTimeline } from "../src/renderTimeline";

type Rulers = { bar: LinearBarRuler };

/** Sample indices where the rendered mono signal is non-zero, collapsed to onsets. */
function onsets(buf: AudioBuffer): number[] {
  const data = buf.getChannelData(0);
  const out: number[] = [];
  let inside = false;
  for (let i = 0; i < data.length; i++) {
    const on = data[i] !== 0;
    if (on && !inside) out.push(i);
    inside = on;
  }
  return out;
}

describe("renderTimeline", () => {
  test("drives a Clock through the whole render: every quarter note lands, nothing is missed", async () => {
    const sampleRate = 48000;
    const windows: TickWindow<Rulers>[] = [];
    const misses: MissedGap[] = [];

    const buf = await renderTimeline({ seconds: 2.05, channels: 1, sampleRate }, (ctx, tickSource) => {
      // a one-sample impulse so onsets are exact
      const impulse = ctx.createBuffer(1, 1, sampleRate);
      impulse.getChannelData(0)[0] = 1;
      const sampler = new Sampler(ctx, { buffer: impulse, polyphony: 8 });
      sampler.output.connect(ctx.destination);

      const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));
      const clock = new Clock({
        timeline,
        tickSource,
        onTick: (window) => {
          windows.push(window);
          for (const { time } of window.rulers.bar.grid(4)) sampler.trigger({ when: time });
        },
        onMiss: (gap) => misses.push(gap),
      });
      clock.start();
    });

    expect(misses).toEqual([]);
    // 120 bpm quarters: 0, 0.5, 1.0, 1.5, 2.0 s -- the last one is well past the
    // first window's 100 ms look-ahead, so it only exists if ticks kept coming
    expect(onsets(buf)).toEqual([0, 0.5, 1.0, 1.5, 2.0].map((t) => t * sampleRate));

    // the clock saw the context's real time advance in step with the render
    const seen = windows.map((w) => w.time.current);
    expect(seen[0]).toBe(0);
    expect(seen.length).toBeGreaterThan(70); // ~2.05 s / 25 ms
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    expect(seen[seen.length - 1]).toBeLessThan(2.05);
    // windows are contiguous: each starts where the previous ended
    for (let i = 1; i < windows.length; i++) expect(windows[i].beat.start).toBe(windows[i - 1].beat.end);
  });

  test("reactive ruler readings refresh as the render advances", async () => {
    const positions: number[] = [];
    await renderTimeline({ seconds: 1, channels: 1 }, (ctx, tickSource) => {
      const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));
      const clock = new Clock({
        timeline,
        tickSource,
        onTick: () => positions.push(timeline.rulers.bar.current.value.bar * 4 + timeline.rulers.bar.current.value.beatInBar),
      });
      clock.start();
    });
    expect(positions[0]).toBe(0);
    // 1 s at 120 bpm is two beats; the last tick sits just under that
    expect(positions[positions.length - 1]).toBeGreaterThan(1.5);
    expect(positions[positions.length - 1]).toBeLessThan(2);
  });

  test("a tickInterval above the clock's lookAhead is reported as misses, as it would be live", async () => {
    const misses: MissedGap[] = [];
    await renderTimeline({ seconds: 0.5, channels: 1, tickInterval: 0.2 }, (ctx, tickSource) => {
      const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
      const clock = new Clock({ timeline, tickSource, lookAhead: 0.1, onTick: () => {}, onMiss: (gap) => misses.push(gap) });
      clock.start();
    });
    expect(misses.length).toBeGreaterThan(0);
  });

  test("a render shorter than one tickInterval still emits the time-0 window", async () => {
    let ticks = 0;
    await renderTimeline({ seconds: 0.01, channels: 1 }, (ctx, tickSource) => {
      const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
      new Clock({ timeline, tickSource, onTick: () => ticks++ }).start();
    });
    expect(ticks).toBe(1);
  });

  test("a tickInterval below one render quantum ticks once per quantum instead of colliding", async () => {
    const sampleRate = 44100;
    const frames: number[] = [];
    await renderTimeline({ seconds: 0.1, channels: 1, sampleRate, tickInterval: 0.001 }, (ctx, tickSource) => {
      const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
      new Clock({ timeline, tickSource, onTick: (w) => frames.push(Math.round(w.time.current * sampleRate)) }).start();
    });
    // 0.1 s is 4410 frames: quantum boundaries 0, 128, ... 4352 -- every one, none twice
    const expected = [];
    for (let f = 0; f < 4410; f += 128) expected.push(f);
    expect(frames).toEqual(expected);
  });

  test("ticks land on the exact quantized frame and stop short of the render end", async () => {
    const sampleRate = 48000;
    const interval = 1024 / sampleRate;
    const run = async (lengthFrames: number) => {
      const frames: number[] = [];
      await renderTimeline({ seconds: lengthFrames / sampleRate, channels: 1, sampleRate, tickInterval: interval }, (ctx, tickSource) => {
        const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
        new Clock({ timeline, tickSource, onTick: (w) => frames.push(Math.round(w.time.current * sampleRate)) }).start();
      });
      return frames;
    };
    // a tick that would fall exactly on the last frame is not a valid stop...
    expect(await run(4096)).toEqual([0, 1024, 2048, 3072]);
    // ...but one quantum before the end is, and must not be dropped
    expect(await run(4096 + 128)).toEqual([0, 1024, 2048, 3072, 4096]);
  });

  test("an error thrown from a tick surfaces instead of hanging the render", async () => {
    await expect(
      renderTimeline({ seconds: 0.2, channels: 1 }, (ctx, tickSource) => {
        const timeline = new Timeline({ audioContext: ctx, bpm: 120 });
        let n = 0;
        new Clock({
          timeline,
          tickSource,
          onTick: () => {
            if (++n === 3) throw new Error("boom");
          },
        }).start();
      }),
    ).rejects.toThrow("boom");
  });

  test("rejects a non-positive tickInterval", async () => {
    await expect(renderTimeline({ seconds: 0.1, tickInterval: 0 }, () => {})).rejects.toThrow(RangeError);
  });
});
