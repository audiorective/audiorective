import { AudioProcessor, type Param, type SchedulableParam } from "@audiorective/signals";
import type { StepSynth } from "./StepSynth";

export interface Step {
  active: boolean;
  frequency: number;
}

const NOTE_FREQUENCIES: Record<string, number> = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
};

export const NOTES = Object.keys(NOTE_FREQUENCIES);
export const noteToFreq = (note: string): number => NOTE_FREQUENCIES[note] ?? 440;

const STEP_COUNT = 8;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

export class Sequencer extends AudioProcessor {
  readonly bpm: SchedulableParam = this.param({ default: 120, schedulable: true as const });
  readonly steps: Param<Step[]> = this.param<Step[]>({ default: Array.from({ length: STEP_COUNT }, () => ({ active: false, frequency: 440 })) });
  readonly currentStep: Param<number> = this.param({ default: -1 });
  readonly playing: Param<boolean> = this.param({ default: false });

  private readonly synth: StepSynth;
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _nextStepTime = 0;
  private _stepIndex = 0;

  constructor(synth: StepSynth, audioCtx: AudioContext) {
    super(audioCtx);
    this.synth = synth;
  }

  get output(): AudioNode | undefined {
    return undefined;
  }

  toggleStep(index: number): void {
    const s = this.steps.value;
    const updated = [...s];
    updated[index] = { ...updated[index], active: !updated[index].active };
    this.steps.value = updated;
  }

  setStepNote(index: number, frequency: number): void {
    const s = this.steps.value;
    const updated = [...s];
    updated[index] = { ...updated[index], frequency };
    this.steps.value = updated;
  }

  start(): void {
    if (this.playing.value) return;
    this.playing.value = true;
    this._stepIndex = 0;
    this._nextStepTime = this.context.currentTime;
    this._schedule();
    this._timerId = setInterval(() => this._schedule(), LOOKAHEAD_MS);
  }

  stop(): void {
    this.playing.value = false;
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this.currentStep.value = -1;
  }

  private _schedule(): void {
    const steps = this.steps.value;
    while (this._nextStepTime < this.context.currentTime + SCHEDULE_AHEAD_S) {
      const step = steps[this._stepIndex];
      this.currentStep.value = this._stepIndex;

      if (step.active) {
        this.synth.playNote(step.frequency, this._nextStepTime);
      }

      const secondsPerBeat = 60.0 / this.bpm.value;
      // 16th notes: each step is a 16th note subdivision
      const secondsPerStep = secondsPerBeat / 2;
      this._nextStepTime += secondsPerStep;
      this._stepIndex = (this._stepIndex + 1) % STEP_COUNT;
    }
  }

  override destroy(): void {
    this.stop();
    super.destroy();
  }
}
