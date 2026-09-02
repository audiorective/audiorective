import { createEngine, type AudioEngine } from "@audiorective/core";
import { Clock, CycleBarRuler, Timeline } from "@audiorective/clock";
import { createEngineContext } from "@audiorective/react";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { Beat } from "./Beat";
import { Click } from "./Click";
import { Lab } from "./graph";
import { loadLimiterWorklet, LookaheadLimiter } from "./LookaheadLimiter";

const BPM = 110;

type DefineGraph = AudioEngine["defineGraph"];

function buildLabResult(ctx: AudioContext, defineGraph: DefineGraph, coreRef: { current?: AudioEngine }) {
  const beat = new Beat(ctx, { kit: createDrumKit(ctx) });
  const click = new Click(ctx);
  const split = new GainNode(ctx);
  const dry = new GainNode(ctx);
  const master = new GainNode(ctx);

  const timeline = new Timeline({ audioContext: ctx, bpm: BPM }).addRuler("pattern", new CycleBarRuler({ numerator: 4, denominator: 4, bars: 1 }));
  const clock = new Clock({
    timeline,
    onTick: (window) => {
      beat.schedule(window);
      click.schedule(window);
    },
  });

  // Constructed without a limiter — the first graph is dry/click-only, as if
  // bypassed — since the worklet it needs loads asynchronously.
  const lab = new Lab(ctx, { beat, click, split, dry, master }, defineGraph);

  const ready = loadLimiterWorklet(ctx).then(() => {
    const limiter = new LookaheadLimiter(ctx);
    lab.attach(limiter);
    // Registered here rather than by `createEngine`'s scan of the setup's
    // return value: the limiter doesn't exist until after that scan has run.
    coreRef.current?.register(limiter);
  });

  return { beat, click, split, dry, master, timeline, clock, lab, ready };
}

/**
 * A setup callback plus the `AudioEngine` it was built for — split apart
 * because `createEngine`'s setup runs before the wrapping `{ ...result, core }`
 * object exists, so the callback can't close over "its own" engine directly.
 * `attach` is called with `core` right after `createEngine` returns (still
 * synchronous, well before `ready` resolves), so by the time `ready`'s
 * continuation runs and needs `core` to register the limiter, the box is filled.
 */
export interface LabSetup {
  setup: (ctx: AudioContext, helpers: { defineGraph: DefineGraph }) => ReturnType<typeof buildLabResult>;
  attach: (core: AudioEngine) => void;
}

/**
 * Builds everything except the limiter synchronously (its worklet loads
 * asynchronously), then finishes wiring — constructing the limiter and the
 * root graph — once `ready` resolves. Exported so tests can drive the same
 * setup against an offline context: `const { setup, attach } = createLabSetup();
 * const engine = createEngine(setup, { context }); attach(engine.core); await engine.ready;`
 */
export function createLabSetup(): LabSetup {
  const coreRef: { current?: AudioEngine } = {};
  return {
    setup: (ctx, { defineGraph }) => buildLabResult(ctx, defineGraph, coreRef),
    attach: (core) => {
      coreRef.current = core;
    },
  };
}

const { setup, attach } = createLabSetup();
export const engine = createEngine(setup);
attach(engine.core);

export const { EngineProvider, useEngine } = createEngineContext(engine);

declare global {
  interface Window {
    __labEngine?: typeof engine;
  }
}
if (typeof window !== "undefined") {
  window.__labEngine = engine;
}
