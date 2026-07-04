import { createEngine, Analyser } from "@audiorective/core";
import { DroneSynth } from "./DroneSynth";

/** Pure audio. No renderer references anywhere in this file. */
export const engine = createEngine((ctx) => {
  const synth = new DroneSynth(ctx);
  // Analyser is a core primitive — a pass-through tap. Wire it between the
  // synth and the speakers; the Pixi layer polls it each frame.
  const analyser = new Analyser(ctx, { fftSize: 256, smoothingTimeConstant: 0.82 });
  synth.output.connect(analyser.input);
  analyser.output.connect(ctx.destination);
  return { synth, analyser };
});
