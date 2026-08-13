import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { DrumMachine } from "./DrumMachine";
import { createDrumKit } from "./drumKit";

/**
 * The app's single engine. `createEngine` owns the AudioContext for the page's
 * lifetime, so there is no per-component context to create, resume, or close —
 * `EngineProvider`'s `autoStart` satisfies the browser's user-gesture
 * requirement on the first interaction.
 */
export const engine = createEngine((ctx) => {
  const machine = new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx) });
  // The machine exposes `output` rather than wiring itself to the destination,
  // so routing it through an EQ or reverb later is a one-line change here.
  machine.output.connect(ctx.destination);
  return { machine };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);

declare global {
  interface Window {
    __seqEngine?: typeof engine;
  }
}
if (typeof window !== "undefined") {
  window.__seqEngine = engine;
}
