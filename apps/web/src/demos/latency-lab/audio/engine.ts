import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { createLabSetup } from "./labSetup";

/**
 * The app's single engine. `createEngine` owns the AudioContext for the
 * page's lifetime — importing this module constructs it, so tests that only
 * need `createLabSetup` should import `./labSetup` instead.
 */
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
