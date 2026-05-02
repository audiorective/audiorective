import { Spatial, cell, createEngine, type Cell } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { MusicPlayer } from "./MusicPlayer";
import { loadTracksJson } from "./tracks";

export interface UIState {
  popupOpen: boolean;
  cdHover: boolean;
}

const initialTracks = await loadTracksJson();

export const engine = createEngine((ctx) => {
  const player = new MusicPlayer(ctx, initialTracks);
  const spatial = new Spatial(ctx, {
    distanceModel: "inverse",
    refDistance: 1.5,
    maxDistance: 25,
    rolloffFactor: 1.4,
  });
  player.output.connect(spatial.input);
  spatial.output.connect(ctx.destination);

  const ui: Cell<UIState> = cell<UIState>({ popupOpen: false, cdHover: false });
  return { player, spatial, ui };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);
