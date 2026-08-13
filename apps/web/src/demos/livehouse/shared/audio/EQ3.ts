import { AudioProcessor } from "@audiorective/core";
import type { SchedulableParam } from "@audiorective/core";

type Params = {
  masterVolume: SchedulableParam;
  eqLow: SchedulableParam;
  eqMid: SchedulableParam;
  eqHigh: SchedulableParam;
};

export class EQ3 extends AudioProcessor<Params> {
  private readonly _input: GainNode;
  private readonly _output: GainNode;

  constructor(ctx: AudioContext) {
    const input = new GainNode(ctx);
    const low = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 250 });
    const mid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 1000, Q: 1 });
    const high = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 4000 });
    const output = new GainNode(ctx, { gain: 0.8 });
    input.connect(low).connect(mid).connect(high).connect(output);

    super(ctx, ({ param }) => ({
      params: {
        masterVolume: param({ default: 0.8, min: 0, max: 1, bind: output.gain }),
        eqLow: param({ default: 0, min: -12, max: 12, bind: low.gain }),
        eqMid: param({ default: 0, min: -12, max: 12, bind: mid.gain }),
        eqHigh: param({ default: 0, min: -12, max: 12, bind: high.gain }),
      },
    }));

    this._input = input;
    this._output = output;
  }

  override get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }

  override destroy(): void {
    super.destroy();
    this._input.disconnect();
    this._output.disconnect();
  }
}
