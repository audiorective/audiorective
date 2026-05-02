import { cell, Spatial, type Cell, type SpatialOptions } from "@audiorective/core";
import type { StepSynth } from "./instruments/StepSynth";

export interface Step {
  active: boolean;
  frequency?: number;
}

export class TrackSequencer {
  readonly steps: Cell<Step[]>;
  readonly spatial: Spatial;
  private readonly synth: StepSynth;

  constructor(synth: StepSynth, spatialOptions: SpatialOptions = {}, defaultFreq = 440) {
    this.synth = synth;
    this.steps = cell<Step[]>(Array.from({ length: 8 }, () => ({ active: false, frequency: defaultFreq })));

    this.spatial = new Spatial(synth.context, spatialOptions);
    synth.output?.connect(this.spatial.input);
    this.spatial.output.connect(synth.context.destination);
  }

  tick(stepIndex: number, time: number): void {
    const step = this.steps.value[stepIndex];
    if (step.active && step.frequency !== undefined) {
      this.synth.playNote(step.frequency, time);
    }
  }

  silence(): void {
    this.synth.silence();
  }

  toggleStep(index: number): void {
    this.steps.update((draft) => {
      draft[index].active = !draft[index].active;
    });
  }

  setStepNote(index: number, frequency: number): void {
    this.steps.update((draft) => {
      draft[index].frequency = frequency;
    });
  }
}
