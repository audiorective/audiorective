/** A copy of `buffer` with every channel's samples in reverse order. */
export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c).slice();
    data.reverse();
    out.copyToChannel(data, c);
  }
  return out;
}

/**
 * The region `[offset, offset + duration)` of the original buffer, expressed
 * as an offset/duration into its reversed copy. Regions are clamped to the
 * buffer; an offset past the end yields an empty region.
 */
export function reverseRegion(offset: number, duration: number | undefined, bufferDuration: number): { offset: number; duration: number } {
  const start = Math.min(Math.max(0, offset), bufferDuration);
  const end = duration == null ? bufferDuration : Math.min(bufferDuration, start + duration);
  return { offset: bufferDuration - end, duration: end - start };
}
