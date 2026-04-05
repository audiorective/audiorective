import { AudioProcessor, type Param } from "@audiorective/core";
import type { StepSynth } from "./instruments/StepSynth";

export interface Step {
  active: boolean;
  frequency?: number;
}

export class TrackSequencer extends AudioProcessor {
  readonly steps: Param<Step[]>;
  private readonly synth: StepSynth;

  constructor(synth: StepSynth, audioCtx: AudioContext, defaultFreq = 440) {
    super(audioCtx);
    this.synth = synth;
    this.steps = this.param<Step[]>({
      default: Array.from({ length: 8 }, () => ({ active: false, frequency: defaultFreq })),
    });
  }

  get output(): AudioNode | undefined {
    return undefined;
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
    const s = [...this.steps.value];
    s[index] = { ...s[index], active: !s[index].active };
    this.steps.value = s;
  }

  setStepNote(index: number, frequency: number): void {
    const s = [...this.steps.value];
    s[index] = { ...s[index], frequency };
    this.steps.value = s;
  }
}
