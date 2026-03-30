import { AudioEngine } from "@audiorective/signals";
import { StepSynth } from "./StepSynth";
import { Sequencer } from "./Sequencer";

class SequencerEngine extends AudioEngine {
  synth!: StepSynth;
  sequencer!: Sequencer;

  protected setup(context: AudioContext): void {
    this.synth = this.register(new StepSynth(context));
    this.synth.output.connect(context.destination);
    this.sequencer = this.register(new Sequencer(this.synth, context));
  }
}

export const engine = new SequencerEngine();
