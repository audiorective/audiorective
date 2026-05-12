import { cell, createEngine, type Cell } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { EQ3 } from "../../spatial-room/audio/EQ3";
import { loadTracksJson } from "../../spatial-room/audio/tracks";
import { PCMusicPlayer } from "./PCMusicPlayer";

export interface UIState {
  popupOpen: boolean;
  cdHover: boolean;
}

/**
 * Engine for the PlayCanvas-flavoured Spatial Music Room.
 *
 * Cooperate-first integration: PlayCanvas's `SoundComponent` owns the source and
 * the spatializer (PannerNode + listener). The audiorective engine here owns only
 * the EQ chain and the UI/transport state — `eq.input`/`eq.output` are spliced
 * pre-panner into the slot at scene-build time via `bindEffect`.
 *
 * The engine creates its own AudioContext at module construction. `attach(engine, app)`
 * (called from the scene) installs that context into PlayCanvas's SoundManager
 * before any sound plays, so both share one context with no separate Web Audio graph
 * required at this layer.
 */
export const engine = createEngine((ctx) => {
  const eq = new EQ3(ctx);
  // eq is left dangling here on purpose. bindEffect splices it into the live
  // source → panner edge of each SoundInstance3d that the slot creates.
  const player = new PCMusicPlayer([]);
  const ui: Cell<UIState> = cell<UIState>({ popupOpen: false, cdHover: false });
  return { eq, player, ui };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);

// Expose the engine on window for DevTools inspection (read params, mutate,
// inspect AudioContext state). Same shape as the other demos.
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
  engine.player.tracks.value = tracks;
  engine.player.loadTrack(0);
});
