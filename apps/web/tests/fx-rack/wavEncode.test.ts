import { describe, expect, it } from "vitest";
import { encodeWav } from "../../src/demos/fx-rack/audio/wavEncode";

describe("encodeWav", () => {
  it("writes a 44-byte header plus 16-bit interleaved samples", async () => {
    const ctx = new OfflineAudioContext(2, 4, 48000);
    const buf = ctx.createBuffer(2, 4, 48000);
    buf.getChannelData(0).set([0, 0.5, -0.5, 1]);
    buf.getChannelData(1).set([1, -1, 0, 0]);
    const bytes = new Uint8Array(await encodeWav(buf).arrayBuffer());
    expect(bytes.length).toBe(44 + 4 * 2 * 2);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767); // R sample 0 = 1.0
    expect(view.getInt16(48, true)).toBe(16383); // L sample 1 = 0.5
  });
});
