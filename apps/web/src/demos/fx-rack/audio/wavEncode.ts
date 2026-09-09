/** Encodes an AudioBuffer as a 16-bit PCM WAV file, channels interleaved. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels,
    frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + frames * channels * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
      o += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}
