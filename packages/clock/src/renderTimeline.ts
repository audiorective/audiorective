import { renderOffline, type RenderOfflineOptions } from "@audiorective/core";
import { ManualTickSource, type TickSource } from "./TickSource";

/** Web Audio's render quantum, in frames — `OfflineAudioContext.suspend` rounds to it. */
const RENDER_QUANTUM = 128;

/** Matches `Clock`'s default `tickInterval`, and sits well below its default 100 ms `lookAhead`. */
const DEFAULT_TICK_INTERVAL = 0.025;

export interface RenderTimelineOptions extends RenderOfflineOptions {
  /**
   * Seconds of audio time between ticks. Default 0.025 — `Clock`'s own default.
   * Keep it below the driven clock's `lookAhead`, exactly as live: a tick that
   * lands past the previous window's end is a miss offline too. An offline
   * render can only pause on a 128-frame render-quantum boundary, so ticks are
   * never closer than one quantum: a smaller interval ticks once per quantum.
   */
  tickInterval?: number;
}

/**
 * `renderOffline` for a `Clock`-driven graph. An `OfflineAudioContext` renders
 * as fast as it can and its `currentTime` never moves before rendering starts,
 * so a timer-driven tick source would emit one window and then starve. This
 * hands `setup` a tick source to build the clock on, then drives it in step
 * with the render: the first tick fires at time 0 before rendering, and every
 * `tickInterval` after that the render is suspended, ticked, and resumed —
 * the clock reads the context's real `currentTime` throughout, so there is
 * no fake time source and no test-only seam. Start the transport inside
 * `setup`; the first window is emitted as soon as it returns.
 *
 * One tick source drives one clock (`ManualTickSource` holds a single
 * callback), which is also the package's one-clock rule.
 */
export async function renderTimeline(
  options: RenderTimelineOptions,
  setup: (ctx: OfflineAudioContext, tickSource: TickSource) => void | Promise<void>,
): Promise<AudioBuffer> {
  const tickInterval = options.tickInterval ?? DEFAULT_TICK_INTERVAL;
  if (!(tickInterval > 0)) throw new RangeError(`renderTimeline: tickInterval must be positive, got ${tickInterval}`);

  let drive: Promise<void> | undefined;
  const buffer = await renderOffline(options, async (ctx) => {
    const ticks = new ManualTickSource();
    await setup(ctx, ticks);
    // time 0, before rendering starts -- the first window
    ticks.tick();
    // the first suspend is scheduled synchronously here, ahead of startRendering
    drive = driveTicks(ctx, ticks, tickInterval);
    // rendering still has to finish before `drive` is awaited below; keep an
    // early failure from surfacing as an unhandled rejection in the meantime
    drive.catch(() => {});
  });
  await drive;
  return buffer;
}

async function driveTicks(ctx: OfflineAudioContext, ticks: ManualTickSource, interval: number): Promise<void> {
  // `suspend(t)` pauses on the render-quantum boundary at or after `t`
  // (ceil), rejects a second suspend on a frame that already has one, and a
  // suspend at or past the end of the render never settles. So every stop is
  // planned in quantized frames: the k-th tick's nominal time rounded up to a
  // quantum, never the same quantum twice (a sub-quantum interval degrades
  // to one tick per quantum), and never at or beyond `ctx.length`.
  const quantize = (t: number): number => Math.ceil((t * ctx.sampleRate) / RENDER_QUANTUM) * RENDER_QUANTUM;
  // ask for a time safely inside the quantum below the target, so rounding
  // error in frame/sampleRate can't push the actual stop one quantum later
  const suspendAtFrame = (frame: number): Promise<void> => ctx.suspend((frame - RENDER_QUANTUM / 2) / ctx.sampleRate);

  let frame = 0;
  const nextFrame = (k: number): number | undefined => {
    const next = Math.max(quantize(k * interval), frame + RENDER_QUANTUM);
    return next < ctx.length ? next : undefined;
  };

  let next = nextFrame(1);
  let pending = next === undefined ? undefined : suspendAtFrame(next);
  for (let k = 1; pending !== undefined && next !== undefined; k++) {
    await pending;
    frame = next;
    try {
      ticks.tick();
      // schedule the next stop before letting the render run again
      next = nextFrame(k + 1);
      pending = next === undefined ? undefined : suspendAtFrame(next);
    } finally {
      await ctx.resume();
    }
  }
}
