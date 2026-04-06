import { cell, type Cell } from "@audiorective/core";
import type { Step } from "./TrackSequencer";

interface DrumSynthLike {
  play(time: number): void;
  silence(): void;
}

export class DrumSequencer {
  readonly steps: Cell<Step[]>;
  private readonly synth: DrumSynthLike;

  constructor(synth: DrumSynthLike) {
    this.synth = synth;
    this.steps = cell<Step[]>(Array.from({ length: 8 }, () => ({ active: false })));
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
