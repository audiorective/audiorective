import { Spatial, createEngine } from "@audiorective/core";
import { MusicPlayer } from "./MusicPlayer";
import { loadTracksJson } from "./tracks";

/**
 * The Spatial Music Room audio engine: an HTMLAudio-backed {@link MusicPlayer}
 * (source + 3-band EQ) feeding a {@link Spatial} panner into the destination.
 *
 * Renderer-agnostic — owns the entire audio graph. A renderer demo only drives
 * `spatial.panner` (and the AudioContext listener) from its scene transforms;
 * it never reconstructs the graph.
 */
export function createSpatialMusicEngine() {
  return createEngine((ctx) => {
    const player = new MusicPlayer(ctx, []);
    const spatial = new Spatial(ctx, {
      distanceModel: "inverse",
      refDistance: 1.5,
      maxDistance: 25,
      rolloffFactor: 1.4,
    });
    player.output.connect(spatial.input);
    spatial.output.connect(ctx.destination);
    return { player, spatial };
  });
}

export type SpatialMusicEngine = ReturnType<typeof createSpatialMusicEngine>;

/** Fetch `tracks.json` and load the first track once available. */
export function loadTracksInto(engine: SpatialMusicEngine): void {
  void loadTracksJson().then((tracks) => {
    if (tracks.length === 0) return;
    engine.player.cells.tracks.value = tracks;
    engine.player.loadTrack(0);
  });
}
