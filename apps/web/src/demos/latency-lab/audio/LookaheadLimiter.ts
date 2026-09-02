import { AudioProcessor, type SchedulableParam } from "@audiorective/core";

export const LIMITER_WORKLET_URL = "/worklets/lookahead-limiter.js";

const _loadedContexts = new WeakSet<BaseAudioContext>();

/** Adds the limiter's worklet module to `ctx`, once. Must resolve before `new LookaheadLimiter(ctx)`. */
export async function loadLimiterWorklet(ctx: BaseAudioContext): Promise<void> {
  if (_loadedContexts.has(ctx)) return;
  await ctx.audioWorklet.addModule(LIMITER_WORKLET_URL);
  _loadedContexts.add(ctx);
}

export interface LookaheadLimiterOptions {
  lookaheadSeconds?: number;
  ceiling?: number;
}

const DEFAULT_LOOKAHEAD_SECONDS = 0.02;

/**
 * Brickwall limiter with a runtime-adjustable lookahead. Wraps the
 * `lookahead-limiter` AudioWorklet; `loadLimiterWorklet(ctx)` must have
 * resolved before construction.
 */
export class LookaheadLimiter extends AudioProcessor<{ ceiling: SchedulableParam }> {
  private readonly _node: AudioWorkletNode;

  constructor(ctx: BaseAudioContext, opts: LookaheadLimiterOptions = {}) {
    const lookaheadSeconds = opts.lookaheadSeconds ?? DEFAULT_LOOKAHEAD_SECONDS;
    const node = new AudioWorkletNode(ctx, "lookahead-limiter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    super(ctx, ({ param }) => ({
      params: {
        ceiling: param({ default: opts.ceiling ?? 0.9, bind: node.parameters.get("ceiling")! }),
      },
      latency: param({ default: Math.round(lookaheadSeconds * ctx.sampleRate), min: 1, max: ctx.sampleRate }),
    }));

    this._node = node;

    // The slider writes `latency`; forward it to the worklet so its read head moves.
    this.effect(() => node.port.postMessage({ lookahead: this.latency.value }));
  }

  get input(): AudioWorkletNode {
    return this._node;
  }

  get output(): AudioWorkletNode {
    return this._node;
  }

  destroy(): void {
    this._node.port.close();
    this._node.disconnect();
    super.destroy();
  }
}
