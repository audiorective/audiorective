/** Fetch a URL and decode it into an AudioBuffer on the given context. */
export async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadAudioBuffer: failed to fetch ${url} (${res.status})`);
  }
  const data = await res.arrayBuffer();
  return ctx.decodeAudioData(data);
}

/**
 * Caches decoded AudioBuffers by URL and dedupes concurrent loads. One decoded
 * buffer can feed many Samplers/voices. Lifetime is explicit — call clear()
 * to release.
 */
export class AudioBufferCache {
  private readonly ctx: AudioContext;
  private readonly cache = new Map<string, Promise<AudioBuffer>>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  load(url: string): Promise<AudioBuffer> {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = loadAudioBuffer(this.ctx, url);
      this.cache.set(url, pending);
      // Drop failed loads so a transient error can be retried.
      pending.catch(() => {
        if (this.cache.get(url) === pending) this.cache.delete(url);
      });
    }
    return pending;
  }

  /**
   * Forget all cached entries. Does not cancel in-flight loads — a load still in
   * flight when clear() runs will resolve normally for its awaiters, but its
   * result won't be re-cached.
   */
  clear(): void {
    this.cache.clear();
  }
}
