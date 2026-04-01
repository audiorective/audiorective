import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { StepSynth } from "./StepSynth";
import { Sequencer } from "./Sequencer";

export const engine = createEngine((ctx) => {
  const synth = new StepSynth(ctx);
  synth.output.connect(ctx.destination);
  const sequencer = new Sequencer(synth, ctx);
  return { synth, sequencer };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);
