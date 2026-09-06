import { AudioProcessor, type Cell, type SchedulableParam } from "@audiorective/core";
import { registerWorklet } from "../registerWorklet";
import { DYNAMICS_WORKLET, DYNAMICS_WORKLET_NAME } from "../worklets/dynamics.worklet";

export interface DynamicsCoreOptions {
  threshold: number;
  ratio: number;
  knee: number;
  attack: number;
  release: number;
  makeup: number;
  lookahead: number;
}

type P = {
  threshold: SchedulableParam;
  ratio: SchedulableParam;
  knee: SchedulableParam;
  attack: SchedulableParam;
  release: SchedulableParam;
  makeup: SchedulableParam;
};

/** Worklet-backed compressor core. Constructs synchronously; the node arrives when `ready` resolves. */
export class DynamicsCore extends AudioProcessor<P, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  readonly ready: Promise<void>;
  private node: AudioWorkletNode | null = null;
  private destroyed = false;

  constructor(ctx: BaseAudioContext, opts: DynamicsCoreOptions) {
    const input = new GainNode(ctx),
      output = new GainNode(ctx);
    const lookaheadSamples = Math.round(opts.lookahead * ctx.sampleRate);
    super(ctx, ({ schedulableParam, cell }) => ({
      params: {
        threshold: schedulableParam({ default: opts.threshold, min: -100, max: 0 }),
        ratio: schedulableParam({ default: Number.isFinite(opts.ratio) ? opts.ratio : 1000, min: 1, max: 1000 }),
        knee: schedulableParam({ default: opts.knee, min: 0, max: 40 }),
        attack: schedulableParam({ default: opts.attack, min: 0, max: 1 }),
        release: schedulableParam({ default: opts.release, min: 0.001, max: 5 }),
        makeup: schedulableParam({ default: opts.makeup, min: 0, max: 40 }),
      },
      cells: { reduction: cell(0), isReady: cell(false) },
      latency: lookaheadSamples,
    }));
    this._input = input;
    this._output = output;

    this.ready = registerWorklet(ctx, DYNAMICS_WORKLET_NAME, DYNAMICS_WORKLET).then(() => {
      if (this.destroyed) return;
      const node = new AudioWorkletNode(ctx, DYNAMICS_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { lookaheadSamples },
      });
      // TypeScript's AudioParamMap only declares forEach; it is a ReadonlyMap at runtime.
      const nodeParams = node.parameters as unknown as ReadonlyMap<string, AudioParam>;
      for (const key of Object.keys(this.params) as (keyof P)[]) {
        this.params[key].rebind(nodeParams.get(key)!, { reassert: true });
      }
      node.port.onmessage = (e: MessageEvent<{ reduction: number }>) => {
        this.cells.reduction.value = e.data.reduction;
      };
      input.connect(node);
      node.connect(output);
      this.node = node;
      this.cells.isReady.value = true;
    });
  }

  get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }

  override destroy(): void {
    this.destroyed = true;
    if (this.node) {
      this.node.port.close();
      this.node.disconnect();
    }
    super.destroy();
  }
}
