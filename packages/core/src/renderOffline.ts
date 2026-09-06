export interface RenderOfflineOptions {
  seconds: number;
  /** Default 2. */
  channels?: number;
  /** Default 44100. */
  sampleRate?: number;
}

/**
 * Builds an OfflineAudioContext, runs `setup` against it (awaiting it, so
 * worklet-backed processors can finish loading), and returns the render.
 */
export async function renderOffline(options: RenderOfflineOptions, setup: (ctx: OfflineAudioContext) => void | Promise<void>): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(options.channels ?? 2, Math.ceil(options.seconds * sampleRate), sampleRate);
  await setup(ctx);
  return ctx.startRendering();
}
