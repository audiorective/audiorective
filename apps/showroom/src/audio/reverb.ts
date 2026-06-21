/** Build a decaying-noise impulse response — a cheap synthesized room (no asset needed). */
export function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buffer = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buffer;
}

export interface ReverbOptions {
  wet?: number;
  dry?: number;
  buffer?: AudioBuffer;
}

/**
 * A parallel dry/wet reverb. The caller wires: bus → dry → master and
 * bus → convolver → wet → master. If no IR buffer is supplied, one is synthesized
 * (so the headphone-vs-room contrast works without a user-provided IR file).
 */
export function createReverb(ctx: AudioContext, opts: ReverbOptions = {}) {
  const convolver = new ConvolverNode(ctx, { buffer: opts.buffer ?? makeImpulseResponse(ctx) });
  const wet = new GainNode(ctx, { gain: opts.wet ?? 0.25 });
  const dry = new GainNode(ctx, { gain: opts.dry ?? 1 });
  return { convolver, wet, dry };
}
