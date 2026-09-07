import type { AudioEngine } from "@audiorective/core";
import type { TickSource } from "@audiorective/clock";
import { DrumMachine } from "./DrumMachine";
import { createDrumKit } from "./drumKit";
import { LatencyLab } from "./LatencyLab";
import { loadLimiterWorklet, LookaheadLimiter } from "./LookaheadLimiter";

type DefineGraph = AudioEngine["defineGraph"];

export interface SequencerSetupOptions {
  /** Forwarded to the `DrumMachine` — an offline render passes `renderTimeline`'s tick source here. */
  tickSource?: TickSource;
}

function buildSequencer(ctx: AudioContext, defineGraph: DefineGraph, coreRef: { current?: AudioEngine }, options: SequencerSetupOptions) {
  const machine = new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx), tickSource: options.tickSource });
  const split = new GainNode(ctx);
  const dry = new GainNode(ctx);
  const master = new GainNode(ctx);

  // The machine exposes `output` rather than wiring itself to the destination,
  // so routing it through the lab's split/limiter/dry graph is this one edge
  // list, not a change to the machine. Constructed without a limiter — the
  // first graph is dry-only — since the worklet it needs loads asynchronously.
  const lab = new LatencyLab(ctx, { machine, split, dry, master }, defineGraph);

  // Rejects if the worklet module fails to load (e.g. a 404 or a syntax error
  // in it) — callers must handle that instead of waiting on it forever.
  const ready = loadLimiterWorklet(ctx).then(() => {
    const limiter = new LookaheadLimiter(ctx);
    lab.attach(limiter);
    // Registered here rather than by `createEngine`'s scan of the setup's
    // return value: the limiter doesn't exist until after that scan has run.
    if (!coreRef.current) throw new Error("createSequencerSetup: attach(core) must be called before `ready` resolves.");
    coreRef.current.register(limiter);
  });

  return { machine, split, dry, master, lab, ready };
}

/**
 * A setup callback plus the `AudioEngine` it was built for — split apart
 * because `createEngine`'s setup runs before the wrapping `{ ...result, core }`
 * object exists, so the callback can't close over "its own" engine directly.
 * `attach` is called with `core` right after `createEngine` returns (still
 * synchronous, well before `ready` resolves), so by the time `ready`'s
 * continuation runs and needs `core` to register the limiter, the box is filled.
 */
export interface SequencerSetup {
  setup: (ctx: AudioContext, helpers: { defineGraph: DefineGraph }) => ReturnType<typeof buildSequencer>;
  attach: (core: AudioEngine) => void;
}

/**
 * Builds the machine and its routing graph synchronously, then finishes
 * wiring — constructing the limiter and rebuilding the root graph — once
 * `ready` resolves. Used by `engine.ts` for the page's singleton, and directly
 * by tests to drive the same setup against an offline context:
 * `const { setup, attach } = createSequencerSetup(); const engine =
 * createEngine(setup, { context }); attach(engine.core); await engine.ready;`
 */
export function createSequencerSetup(options: SequencerSetupOptions = {}): SequencerSetup {
  const coreRef: { current?: AudioEngine } = {};
  return {
    setup: (ctx, { defineGraph }) => buildSequencer(ctx, defineGraph, coreRef, options),
    attach: (core) => {
      coreRef.current = core;
    },
  };
}
