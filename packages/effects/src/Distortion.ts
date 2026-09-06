import type { Param } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";

export interface DistortionOptions extends EffectOptions {
  /** 0..1 drive. Default 0.4. */
  distortion?: number;
  /** WaveShaper oversampling. Default "4x". */
  oversample?: OverSampleType;
}

const CURVE_LENGTH = 4096;

/** Tone.js's distortion curve normalized to unity peak: soft clipping that approaches a square as k grows. */
export function distortionCurve(amount: number): Float32Array {
  const k = amount * 100;
  const deg = Math.PI / 180;
  const curve = new Float32Array(CURVE_LENGTH);
  // Calculate peak value at x=1 for normalization
  const peak = ((3 + k) * 20 * deg) / (Math.PI + k);
  for (let i = 0; i < CURVE_LENGTH; i++) {
    const x = (i * 2) / CURVE_LENGTH - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x)) / peak;
  }
  return curve;
}

export class Distortion extends Effect<{ distortion: Param<number> }> {
  constructor(ctx: BaseAudioContext, opts: DistortionOptions = {}) {
    const shaper = new WaveShaperNode(ctx, { oversample: opts.oversample ?? "4x", curve: distortionCurve(opts.distortion ?? 0.4) });
    super(
      ctx,
      { input: shaper, output: shaper },
      ({ param }) => ({
        params: {
          distortion: param<number>({
            default: opts.distortion ?? 0.4,
            min: 0,
            max: 1,
            bind: {
              set: (v) => {
                shaper.curve = distortionCurve(v) as Float32Array<ArrayBuffer>;
              },
            },
          }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
  }
}
