import type { Cell, SchedulableParam } from "@audiorective/core";
import { DynamicsCore } from "./dynamics/DynamicsCore";
import { Effect, type EffectOptions } from "./Effect";

export interface CompressorOptions extends EffectOptions {
  threshold?: number;
  ratio?: number;
  knee?: number;
  attack?: number;
  release?: number;
  makeup?: number;
  lookahead?: number;
}

type P = {
  threshold: SchedulableParam;
  ratio: SchedulableParam;
  knee: SchedulableParam;
  attack: SchedulableParam;
  release: SchedulableParam;
  makeup: SchedulableParam;
};

export class Compressor extends Effect<P, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly ready: Promise<void>;
  private readonly core: DynamicsCore;

  constructor(ctx: BaseAudioContext, opts: CompressorOptions = {}) {
    const core = new DynamicsCore(ctx, {
      threshold: opts.threshold ?? -24,
      ratio: opts.ratio ?? 4,
      knee: opts.knee ?? 6,
      attack: opts.attack ?? 0.003,
      release: opts.release ?? 0.25,
      makeup: opts.makeup ?? 0,
      lookahead: opts.lookahead ?? 0,
    });
    super(ctx, { input: core, output: core }, () => ({ params: { ...core.params }, cells: { ...core.cells } }), opts);
    this.ready = core.ready;
    this.core = core;
  }

  override destroy(): void {
    this.core.destroy();
    super.destroy();
  }
}
