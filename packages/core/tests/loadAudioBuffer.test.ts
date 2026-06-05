import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { loadAudioBuffer, AudioBufferCache } from "../src";

describe("loadAudioBuffer", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = new AudioContext();
  });
  afterEach(() => {
    void ctx.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("fetches the url and decodes the response into an AudioBuffer", async () => {
    const fake = ctx.createBuffer(1, 1, ctx.sampleRate);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })),
    );
    const decodeSpy = vi.spyOn(ctx, "decodeAudioData").mockResolvedValue(fake);

    const buf = await loadAudioBuffer(ctx, "/sound.wav");

    expect(globalThis.fetch).toHaveBeenCalledWith("/sound.wav");
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(buf).toBe(fake);
  });

  test("throws with the status when the fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(loadAudioBuffer(ctx, "/missing.wav")).rejects.toThrow(/404/);
  });
});

describe("AudioBufferCache", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = new AudioContext();
  });
  afterEach(() => {
    void ctx.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("dedupes concurrent loads of the same url (one decode, same buffer)", async () => {
    const fake = ctx.createBuffer(1, 1, ctx.sampleRate);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })),
    );
    const decodeSpy = vi.spyOn(ctx, "decodeAudioData").mockResolvedValue(fake);
    const cache = new AudioBufferCache(ctx);

    const p1 = cache.load("/a.wav");
    const p2 = cache.load("/a.wav");
    expect(p1).toBe(p2); // same in-flight promise

    const [b1, b2] = await Promise.all([p1, p2]);
    expect(b1).toBe(b2);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  test("evicts a failed load so it can be retried", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const cache = new AudioBufferCache(ctx);
    await expect(cache.load("/x.wav")).rejects.toThrow();
    // Second call retries rather than returning the rejected promise.
    await expect(cache.load("/x.wav")).rejects.toThrow();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});
