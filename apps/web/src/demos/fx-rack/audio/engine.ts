import { cell, createEngine, loadAudioBuffer } from "@audiorective/core";
import type { PitchShiftEngine } from "@audiorective/effects";
import { createEngineContext } from "@audiorective/react";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { FxRack } from "./FxRack";
import { applySettings, readSettings } from "./exportBars";

export const engine = createEngine((ctx) => {
  const kit = createDrumKit(ctx);
  const build = (pitchEngine: PitchShiftEngine, loop: AudioBuffer | null) => {
    const r = new FxRack(ctx, { kit, loop, pitchEngine });
    r.output.connect(ctx.destination);
    return r;
  };
  const rack = cell(build("granular", null));
  const loopLoaded = loadAudioBuffer(ctx, "/stems/drums.mp3").then((buf) => {
    rack.value.deck.buffer = buf;
  });

  /** Rebuilds the rack on the other pitch engine, carrying every setting across. */
  const setEngine = async (pitchEngine: PitchShiftEngine): Promise<void> => {
    const old = rack.value;
    if (old.inserts.pitchShift.engine === pitchEngine) return;
    const settings = readSettings(old);
    const wasPlaying = old.deck.cells.isPlaying.value;
    old.stop();
    const next = build(pitchEngine, old.deck.buffer);
    await next.ready;
    applySettings(next, { ...settings, engine: pitchEngine });
    old.destroy();
    rack.value = next;
    if (wasPlaying) next.play();
  };

  return { rack, loopLoaded, setEngine };
});
export const { EngineProvider, useEngine } = createEngineContext(engine);
