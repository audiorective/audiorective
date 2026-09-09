import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorklet, WorkletUnavailableError } from "../src";

const SOURCE = `
class Passthrough extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const i = inputs[0], o = outputs[0];
    for (let c = 0; c < o.length; c++) o[c].set(i[c] ?? new Float32Array(o[c].length));
    return true;
  }
}
registerProcessor("test-passthrough", Passthrough);
`;

describe("registerWorklet", () => {
  let ctx: OfflineAudioContext;
  beforeEach(() => {
    ctx = new OfflineAudioContext(1, 128, 44100);
  });
  afterEach(() => vi.restoreAllMocks());

  it("calls addModule once for concurrent registrations of the same name", async () => {
    const spy = vi.spyOn(ctx.audioWorklet, "addModule");
    await Promise.all([registerWorklet(ctx, "test-passthrough", SOURCE), registerWorklet(ctx, "test-passthrough", SOURCE)]);
    await registerWorklet(ctx, "test-passthrough", SOURCE);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() => new AudioWorkletNode(ctx, "test-passthrough")).not.toThrow();
  });

  it("registers independently per context", async () => {
    const other = new OfflineAudioContext(1, 128, 44100);
    await registerWorklet(ctx, "test-passthrough", SOURCE);
    await registerWorklet(other, "test-passthrough", SOURCE);
    expect(() => new AudioWorkletNode(other, "test-passthrough")).not.toThrow();
  });

  it("throws WorkletUnavailableError when the context has no audioWorklet", async () => {
    const fake = { audioWorklet: undefined } as unknown as BaseAudioContext;
    await expect(registerWorklet(fake, "x", SOURCE)).rejects.toBeInstanceOf(WorkletUnavailableError);
  });
});
