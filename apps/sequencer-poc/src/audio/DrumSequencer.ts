import { cell, Spatial, type Cell, type SpatialOptions } from "@audiorective/core";
import type { Step } from "./TrackSequencer";

interface DrumSynthLike {
  readonly context: AudioContext;
  readonly output?: AudioNode;
  play(time: number): void;
  silence(): void;
}

export class DrumSequencer {
  readonly steps: Cell<Step[]>;
  readonly spatial: Spatial;
  private readonly synth: DrumSynthLike;

  constructor(synth: DrumSynthLike, spatialOptions: SpatialOptions = {}) {
    this.synth = synth;
    this.steps = cell<Step[]>(Array.from({ length: 8 }, () => ({ active: false })));

    this.spatial = new Spatial(synth.context, spatialOptions);
    synth.output?.connect(this.spatial.input);
    this.spatial.output.connect(synth.context.destination);
  }

  tick(stepIndex: number, time: number): void {
    const step = this.steps.value[stepIndex];
    if (step.active) {
      this.synth.play(time);
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
}
