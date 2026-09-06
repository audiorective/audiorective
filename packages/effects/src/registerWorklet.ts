export class WorkletUnavailableError extends Error {
  constructor(name: string) {
    super(`registerWorklet: this AudioContext has no audioWorklet, so "${name}" cannot be loaded. Run in a browser with AudioWorklet support.`);
    this.name = "WorkletUnavailableError";
  }
}

const registry = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/**
 * Loads a worklet module into `ctx` once per (context, name). Concurrent and
 * repeated calls share the first load. The source is served from a Blob URL,
 * so no bundler configuration is needed.
 */
export function registerWorklet(ctx: BaseAudioContext, name: string, source: string): Promise<void> {
  if (!ctx.audioWorklet) return Promise.reject(new WorkletUnavailableError(name));
  let perContext = registry.get(ctx);
  if (!perContext) {
    perContext = new Map();
    registry.set(ctx, perContext);
  }
  let pending = perContext.get(name);
  if (!pending) {
    const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
    pending = ctx.audioWorklet
      .addModule(url)
      .finally(() => URL.revokeObjectURL(url))
      .catch((err) => {
        perContext!.delete(name); // let a later call retry after a failed load
        throw err;
      });
    perContext.set(name, pending);
  }
  return pending;
}
