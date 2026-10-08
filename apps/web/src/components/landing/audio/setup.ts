import { Analyser, createEngine } from "@audiorective/core";
import { Channel, Filter, PingPongDelay } from "@audiorective/effects";
import { DrumMachine } from "../../../demos/sequencer/audio/DrumMachine";
import { createDrumKit } from "../../../demos/sequencer/audio/drumKit";

export function createLandingEngine(context?: AudioContext) {
  const engine = createEngine(
    (ctx) => {
      const machine = new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx), bpm: 112 });
      const filter = new Filter(ctx, { frequency: 6500, Q: 0.7 });
      const delay = new PingPongDelay(ctx, { delayTime: 0.27, feedback: 0.3, wet: 0.15 });
      const master = new Channel(ctx, { gain: 0.45 });
      const analyser = new Analyser(ctx, { fftSize: 128 });
      return { machine, filter, delay, master, analyser };
    },
    { context },
  );
  const { machine, filter, delay, master, analyser } = engine;
  engine.core.defineGraph(() => [
    [machine, filter],
    [filter, delay],
    [delay, master],
    [master, analyser],
    [analyser, engine.core.context.destination],
  ]);
  let request = 0;
  let transition = Promise.resolve();
  const enqueue = (action: () => Promise<void>) => {
    transition = transition.catch(() => {}).then(action);
    return transition;
  };
  return {
    ...engine,
    async play() {
      const current = ++request;
      // Resume during the click gesture, then reconcile any pending suspension.
      const started = engine.core.start().then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      return enqueue(async () => {
        const result = await started;
        if (!result.ok) throw result.error;
        if (current !== request) return;
        await engine.core.start();
        if (current === request) machine.play();
      });
    },
    async pause() {
      ++request;
      machine.pause();
      return enqueue(() => engine.core.suspend());
    },
    async stop() {
      ++request;
      machine.stop();
      return enqueue(() => engine.core.suspend());
    },
  };
}
export type LandingEngine = ReturnType<typeof createLandingEngine>;
