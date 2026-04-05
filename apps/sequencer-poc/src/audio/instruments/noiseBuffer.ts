export function createNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
  const frames = Math.floor(ctx.sampleRate * durationSeconds);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
