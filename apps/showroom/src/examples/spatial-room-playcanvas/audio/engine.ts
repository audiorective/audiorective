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
 * switching tracks just repoints `player.activeEq` — no parameter bleed.
 */
export const engine = createEngine((ctx) => {
  const player = new PCMusicPlayer(ctx);
  const ui: Cell<UIState> = cell<UIState>({ popupOpen: false, cdHover: false });
  return { player, ui };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);

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
  if (tracks.length === 0) return;
  engine.player.setTracks(tracks);
});
