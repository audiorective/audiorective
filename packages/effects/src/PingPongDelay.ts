import type { SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";

export interface PingPongDelayOptions extends EffectOptions {
  delayTime?: number;
  feedback?: number;
  /** Ceiling for delayTime, seconds. Default 1. */
  maxDelay?: number;
}

/**
 * Stereo cross-fed delay with alternating left/right echoes. Input is summed to mono and enters on
 * the left delay, then bounces through feedback. Echoes that have crossed the feedback path arrive
 * one render quantum (128 samples) later than `delayTime`.
 */
export class PingPongDelay extends Effect<{ delayTime: SchedulableParam; feedback: SchedulableParam }> {
  private readonly sources: ConstantSourceNode[];

  constructor(ctx: BaseAudioContext, opts: PingPongDelayOptions = {}) {
    const maxDelay = opts.maxDelay ?? 1;
    const entry = new GainNode(ctx, { channelCount: 2, channelCountMode: "explicit" });
    const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const delayL = new DelayNode(ctx, { maxDelayTime: maxDelay });
    const delayR = new DelayNode(ctx, { maxDelayTime: maxDelay });
    const fbL = new GainNode(ctx, { gain: 0 });
    const fbR = new GainNode(ctx, { gain: 0 });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    const sumL = new GainNode(ctx, { gain: 0.5 });
    const sumR = new GainNode(ctx, { gain: 0.5 });
    entry.connect(splitter);
    splitter.connect(sumL, 0);
    splitter.connect(sumR, 1);
    sumL.connect(delayL);
    sumR.connect(delayL);
    delayL.connect(merger, 0, 0);
    delayL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(merger, 0, 1);
    delayR.connect(fbR);
    fbR.connect(delayL);

    const time = fanout(ctx, opts.delayTime ?? 0.25, [delayL.delayTime, delayR.delayTime]);
    const fb = fanout(ctx, opts.feedback ?? 0.2, [fbL.gain, fbR.gain]);

    super(
      ctx,
      { input: entry, output: merger },
      ({ param }) => ({
        params: {
          delayTime: param({ default: opts.delayTime ?? 0.25, bind: time.offset, min: 0, max: maxDelay }),
          feedback: param({ default: opts.feedback ?? 0.2, bind: fb.offset, min: 0, max: 0.99 }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    this.sources = [time, fb];
  }

  override destroy(): void {
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    super.destroy();
  }
}
