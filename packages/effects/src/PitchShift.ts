import type { Cell, Param } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { GranularShifter } from "./pitch/GranularShifter";
import { StretchShifter } from "./pitch/StretchShifter";

export type PitchShiftEngine = "granular" | "stretch";

export interface StretchOptions {
  tonalityHz?: number;
  formantCompensation?: boolean;
  formantSemitones?: number;
  blockMs?: number;
}

export interface PitchShiftOptions extends EffectOptions {
  /** Shift in semitones. Default 0. */
  pitch?: number;
  /** Default "granular". */
  engine?: PitchShiftEngine;
  /** Grain size for the granular engine, seconds. Default 0.1. */
  windowSize?: number;
  stretch?: StretchOptions;
}

export class PitchShift extends Effect<{ pitch: Param<number> }, { isReady: Cell<boolean> }> {
  readonly engine: PitchShiftEngine;
  /** Resolves once the engine is ready to process audio. */
  readonly ready: Promise<void>;
  private readonly core: GranularShifter | StretchShifter;

  constructor(ctx: BaseAudioContext, opts: PitchShiftOptions = {}) {
    const engine = opts.engine ?? "granular";
    const core =
      engine === "stretch"
        ? new StretchShifter(ctx, opts.pitch ?? 0, opts.stretch)
        : new GranularShifter(ctx, { pitch: opts.pitch ?? 0, windowSize: opts.windowSize });
    super(
      ctx,
      { input: core, output: core },
      ({ param, cell }) => ({
        params: {
          pitch: param<number>({
            default: opts.pitch ?? 0,
            min: -24,
            max: 24,
            bind: { set: (v) => core.setPitch(v) },
          }),
        },
        cells: { isReady: cell(engine === "granular") },
      }),
      opts,
    );
    this.engine = engine;
    this.ready =
      core instanceof StretchShifter
        ? core.ready.then(() => {
            this.cells.isReady.value = true;
          })
        : Promise.resolve();
    this.core = core;
  }

  override destroy(): void {
    this.core.destroy();
    super.destroy();
  }
}
