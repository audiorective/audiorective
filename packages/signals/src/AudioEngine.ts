import { signal, effect, type Signal } from "alien-signals";
import { AudioProcessor } from "./AudioProcessor";

export abstract class AudioEngine {
  private _context: AudioContext | null = null;
  private _processors: AudioProcessor[] = [];
  private _ready: Signal<boolean> = signal(false);
  private _cachedPromise: Promise<void> | null = null;

  get context(): AudioContext {
    if (!this._context) throw new Error("AudioEngine not initialized");
    return this._context;
  }

  get ready(): Signal<boolean> {
    return this._ready;
  }

  // Always returns a Promise. Resolved immediately if already ready,
  // otherwise cached so the ref is stable.
  untilReady(): Promise<void> {
    if (this._ready.get()) return Promise.resolve();
    if (this._cachedPromise) return this._cachedPromise;
    this._cachedPromise = new Promise<void>((resolve) => {
      const eff = effect(() => {
        if (this._ready.get()) {
          resolve();
          eff.stop();
        }
      });
    });
    return this._cachedPromise;
  }

  async init(existingContext?: AudioContext): Promise<void> {
    if (this._ready.get()) return;
    this._context = existingContext ?? new AudioContext();
    if (!existingContext) await this._context.resume();
    this.setup(this._context);
    this._ready.set(true);
    this._cachedPromise = null;
  }

  protected abstract setup(context: AudioContext): void;

  protected register<T extends AudioProcessor>(processor: T): T {
    this._processors.push(processor);
    return processor;
  }

  destroy(): void {
    for (const p of this._processors) p.destroy();
    this._processors = [];
    this._context?.close();
    this._context = null;
    this._ready.set(false);
    this._cachedPromise = null;
  }
}
