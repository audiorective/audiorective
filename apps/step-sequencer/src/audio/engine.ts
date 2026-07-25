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
export const engine = createEngine((ctx) => ({
  machine: new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx) }),
}));

export const { EngineProvider, useEngine } = createEngineContext(engine);
