import { AudioProcessor, type Param } from "@audiorective/core";
import type { Step } from "./TrackSequencer";

interface DrumSynthLike {
  play(time: number): void;
  silence(): void;
}

export class DrumSequencer extends AudioProcessor {
  readonly steps: Param<Step[]>;
  private readonly synth: DrumSynthLike;

  constructor(synth: DrumSynthLike, audioCtx: AudioContext) {
    super(audioCtx);
    this.synth = synth;
    this.steps = this.param<Step[]>({
      default: Array.from({ length: 8 }, () => ({ active: false })),
    });
  }

  get output(): AudioNode | undefined {
    return undefined;
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
    const s = [...this.steps.value];
    s[index] = { ...s[index], active: !s[index].active };
    this.steps.value = s;
  }
}
