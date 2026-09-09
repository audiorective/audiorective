import type { Cell, SchedulableParam } from "@audiorective/core";
import { DynamicsCore } from "./dynamics/DynamicsCore";
import { Effect, type EffectOptions } from "./Effect";

export interface LimiterOptions extends EffectOptions {
  threshold?: number;
  release?: number;
  lookahead?: number;
}

/** Brickwall: infinite ratio, hard knee, windowed-peak detection over `lookahead`. */
export class Limiter extends Effect<{ threshold: SchedulableParam; release: SchedulableParam }, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly ready: Promise<void>;
  private readonly core: DynamicsCore;

  constructor(ctx: BaseAudioContext, opts: LimiterOptions = {}) {
    const core = new DynamicsCore(ctx, {
      threshold: opts.threshold ?? -1,
      ratio: Infinity,
      knee: 0,
      attack: 0.001,
      release: opts.release ?? 0.05,
      makeup: 0,
      lookahead: opts.lookahead ?? 0.005,
    });
    super(
      ctx,
      { input: core, output: core },
      () => ({ params: { threshold: core.params.threshold, release: core.params.release }, cells: { ...core.cells } }),
      opts,
    );
    this.ready = core.ready;
    this.core = core;
  }

  override destroy(): void {
    this.core.destroy();
    super.destroy();
  }
}
