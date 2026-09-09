import type { PitchShift } from "../../src";

export function dominantHz(frame: Float32Array, sr: number, lo = 200, hi = 1200): number {
  let best = 0,
    bestMag = 0;
  for (let f = lo; f <= hi; f += 5) {
    let re = 0,
      im = 0;
    for (let n = 0; n < frame.length; n++) {
      const w = (2 * Math.PI * f * n) / sr;
      re += frame[n]! * Math.cos(w);
      im -= frame[n]! * Math.sin(w);
    }
    const m = Math.hypot(re, im);
    if (m > bestMag) {
      bestMag = m;
      best = f;
    }
  }
  return best;
}

export async function renderShift(build: (ctx: OfflineAudioContext) => PitchShift): Promise<Float32Array> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const fx = build(ctx);
  await fx.ready;
  const osc = new OscillatorNode(ctx, { frequency: 440 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0).subarray(22050, 22050 + 8820);
}
