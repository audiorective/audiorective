import { cell, type Cell } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { createSpatialMusicEngine, loadTracksInto } from "../../../shared/audio/engine";

export interface UIState {
  popupOpen: boolean;
  cdHover: boolean;
}

/**
 * Engine for the PlayCanvas-flavoured Spatial Music Room.
 *
 * Anchor model: audiorective owns the entire audio graph (the same shared
 * {@link createSpatialMusicEngine} the three.js demo uses). PlayCanvas only
 * binds the speaker entity's transform onto `spatial.panner` via `bindPanner`,
 * and the camera's `AudioListenerComponent` drives the shared `ctx.listener`.
 */
export const engine = createSpatialMusicEngine();

export const { EngineProvider, useEngine } = createEngineContext(engine);

/**
 * View-only state shared between the imperative PlayCanvas scene (which writes
 * it from raycast hover / click) and the React HUD + popup. Deliberately kept
 * out of the audio engine — it carries no audio meaning.
 */
export const ui: Cell<UIState> = cell<UIState>({ popupOpen: false, cdHover: false });

// Expose the engine on window for DevTools inspection (read params, mutate,
// inspect AudioContext state).
declare global {
  interface Window {
    __audiorectiveEngine?: typeof engine;
  }
}
if (typeof window !== "undefined") {
  window.__audiorectiveEngine = engine;
}

loadTracksInto(engine);
