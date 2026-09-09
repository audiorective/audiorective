import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { createSequencerSetup } from "./setup";

/**
 * The app's single engine. `createEngine` owns the AudioContext for the page's
 * lifetime, so there is no per-component context to create, resume, or close —
 * `EngineProvider`'s `autoStart` satisfies the browser's user-gesture
 * requirement on the first interaction. Importing this module constructs the
 * context, so tests that only need the setup should import `./setup` instead.
 */
const { setup, attach } = createSequencerSetup();
export const engine = createEngine(setup);
attach(engine.core);

export const { EngineProvider, useEngine } = createEngineContext(engine);

declare global {
  interface Window {
    __seqEngine?: typeof engine;
  }
}
if (typeof window !== "undefined") {
  window.__seqEngine = engine;
}
