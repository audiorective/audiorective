/** Exponentially decaying stereo noise — a synthetic room, no binary asset. */
export function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2, decay = 4): AudioBuffer {
  const length = Math.ceil(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 12345;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * Math.exp((-decay * i) / length);
    }
  }
  return ir;
}
