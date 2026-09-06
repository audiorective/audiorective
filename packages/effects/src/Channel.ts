import { AudioProcessor, type Param, type SchedulableParam, SchedulableParam as SchedulableParamClass } from "@audiorective/core";
import type { SendBus } from "./SendBus";

export interface ChannelOptions {
  gain?: number;
  pan?: number;
  mute?: boolean;
  /** Output channel count; mono input is upmixed. Default 2. */
  channelCount?: number;
}

export interface Send {
  readonly gain: SchedulableParam;
  dispose(): void;
}

/** Channel strip: gain → pan → mute, with post-mute sends into a SendBus. */
export class Channel extends AudioProcessor<{ gain: SchedulableParam; pan: SchedulableParam; mute: Param<boolean> }> {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  private readonly sends = new Set<{ node: GainNode; param: SchedulableParam }>();

  constructor(ctx: BaseAudioContext, opts: ChannelOptions = {}) {
    const input = new GainNode(ctx, { channelCount: opts.channelCount ?? 2, channelCountMode: "explicit" });
    const gain = new GainNode(ctx, { gain: opts.gain ?? 1 });
    const pan = new StereoPannerNode(ctx, { pan: opts.pan ?? 0 });
    const mute = new GainNode(ctx, { gain: opts.mute ? 0 : 1 });
    const output = new GainNode(ctx);

    super(ctx, ({ param }) => ({
      params: {
        gain: param({ default: opts.gain ?? 1, bind: gain.gain, min: 0 }),
        pan: param({ default: opts.pan ?? 0, bind: pan.pan, min: -1, max: 1 }),
        mute: param<boolean>({
          default: opts.mute ?? false,
          bind: {
            set: (m) => {
              mute.gain.value = m ? 0 : 1;
            },
          },
        }),
      },
    }));

    this._input = input;
    this._output = output;
    this.defineGraph(() => [
      [input, gain],
      [gain, pan],
      [pan, mute],
      [mute, output],
    ]);
  }

  override get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }

  send(bus: SendBus, name: string, gain = 1): Send {
    const node = new GainNode(this.context, { gain });
    this.output.connect(node);
    node.connect(bus.receive(name));
    const param = new SchedulableParamClass({ default: gain, audioContext: this.context, audioParam: node.gain, min: 0 });
    const entry = { node, param };
    this.sends.add(entry);
    return {
      gain: param,
      dispose: () => {
        if (!this.sends.delete(entry)) return;
        param.destroy();
        node.disconnect();
      },
    };
  }

  override destroy(): void {
    for (const { node, param } of this.sends) {
      param.destroy();
      node.disconnect();
    }
    this.sends.clear();
    super.destroy();
  }
}
