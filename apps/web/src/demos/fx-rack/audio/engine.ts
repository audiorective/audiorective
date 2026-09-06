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
  const loopLoaded = loadAudioBuffer(ctx, "/stems/drums.mp3")
    .then((buf) => {
      rack.value.deck.buffer = buf;
    })
    .catch((err: unknown) => {
      console.warn("fx-rack: drum loop failed to load", err);
    });

  /** Rebuilds the rack on the other pitch engine, carrying every setting across. */
  const switchTo = async (pitchEngine: PitchShiftEngine): Promise<void> => {
    const old = rack.value;
    if (old.inserts.pitchShift.engine === pitchEngine) return;
    const settings = readSettings(old);
    const wasPlaying = old.deck.cells.isPlaying.value;
    old.stop();
    let next: FxRack | undefined;
    try {
      next = build(pitchEngine, old.deck.buffer);
      await next.ready;
    } catch (err) {
      next?.destroy();
      if (wasPlaying) old.play();
      throw err;
    }
    applySettings(next, { ...settings, engine: pitchEngine });
    old.destroy();
    rack.value = next;
    if (wasPlaying) next.play();
  };

  // Queued so two calls in flight don't both read the same `rack.value` and
  // race to destroy it; each waits for the previous switch to finish first.
  // The chain itself never rejects — a failed switch would otherwise wedge
  // every later call — but the promise returned to the caller still does.
  let pending: Promise<void> = Promise.resolve();
  const setEngine = (pitchEngine: PitchShiftEngine): Promise<void> => {
    const result = pending.then(() => switchTo(pitchEngine));
    pending = result.catch(() => {});
    return result;
  };

  return { rack, loopLoaded, setEngine };
});
export const { EngineProvider, useEngine } = createEngineContext(engine);
