import { cell, createEngine, type Cell } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { loadTracksJson } from "../../spatial-room/audio/tracks";
import { PCMusicPlayer } from "./PCMusicPlayer";

export interface UIState {
  popupOpen: boolean;
  cdHover: boolean;
}

/**
 * Engine for the PlayCanvas-flavoured Spatial Music Room.
 *
 * Cooperate-first integration: PlayCanvas's `SoundComponent` owns source +
 * spatializer + listener; audiorective owns the per-track EQ chains. Each
 * track has its own `EQ3` wired pre-panner via `createAudiorectiveSlot`;
 * switching tracks just repoints `player.activeEqIndex` — no parameter bleed.
 */
export const engine = createEngine((ctx) => {
  const player = new PCMusicPlayer(ctx);
  return { player };
});

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

void loadTracksJson().then((tracks) => {
  for (const track of tracks) {
    engine.player.addTrack(track);
  }
});
