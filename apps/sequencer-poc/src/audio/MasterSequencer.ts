import { AudioProcessor, type Param, type SchedulableParam } from "@audiorective/core";

const STEP_COUNT = 8;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

type StepCallback = (stepIndex: number, scheduledTime: number) => void;
type SilenceCallback = () => void;

export class MasterSequencer extends AudioProcessor<{
  bpm: SchedulableParam;
  playing: Param<boolean>;
  currentStep: Param<number>;
}> {
  private _tracks: Array<{ tick: StepCallback; silence: SilenceCallback }> = [];
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _nextStepTime = 0;
  private _stepIndex = 0;

  constructor(context: AudioContext) {
    super(context, ({ param, schedulableParam }) => ({
      params: {
        bpm: schedulableParam({ default: 120 }),
        playing: param<boolean>({ default: false }),
        currentStep: param<number>({ default: -1 }),
      },
    }));
  }

  get output(): AudioNode | undefined {
    return undefined;
  }

  register(tick: StepCallback, silence: SilenceCallback): void {
    this._tracks.push({ tick, silence });
  }

  start(): void {
    if (this.params.playing.value) return;
    this.params.playing.value = true;
    this._stepIndex = 0;
    this._nextStepTime = this.context.currentTime;
    this._schedule();
    this._timerId = setInterval(() => this._schedule(), LOOKAHEAD_MS);
  }

  stop(): void {
    this.params.playing.value = false;
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    for (const { silence } of this._tracks) silence();
    this.params.currentStep.value = -1;
  }

  rampBpm(target: number, duration: number): void {
    const now = this.context.currentTime;
    this.params.bpm.setValueAtTime(this.params.bpm.value, now);
    this.params.bpm.linearRampToValueAtTime(target, now + duration);
  }

  private _schedule(): void {
    while (this._nextStepTime < this.context.currentTime + SCHEDULE_AHEAD_S) {
      const step = this._stepIndex;
      this.params.currentStep.value = step;

      for (const { tick } of this._tracks) {
        tick(step, this._nextStepTime);
      }

      // 16th note steps
      const secondsPerStep = 60.0 / this.params.bpm.value / 2;
      this._nextStepTime += secondsPerStep;
      this._stepIndex = (this._stepIndex + 1) % STEP_COUNT;
    }
  }

  override destroy(): void {
    this.stop();
    super.destroy();
  }
}
