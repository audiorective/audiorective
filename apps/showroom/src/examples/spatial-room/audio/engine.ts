import { cell, type Cell } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { createSpatialMusicEngine, loadTracksInto } from "../../../shared/audio/engine";

export interface UIState {
  popupOpen: boolean;
  cdHover: boolean;
}

export const engine = createSpatialMusicEngine();
export const { EngineProvider, useEngine } = createEngineContext(engine);

/** View-only scene-interaction state — carries no audio meaning, kept out of the audio engine. */
export const ui: Cell<UIState> = cell<UIState>({ popupOpen: false, cdHover: false });

loadTracksInto(engine);
