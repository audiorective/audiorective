import { signal, effect, type Signal } from "alien-signals";
import { AudioProcessor } from "./AudioProcessor";
import type { EngineState } from "./types";

export abstract class AudioEngine {
  private _context: AudioContext;
  private _processors: AudioProcessor[] = [];
  private _state: Signal<EngineState> = signal<EngineState>("idle");
  private _cachedPromise: Promise<void> | null = null;

  constructor(existingContext?: AudioContext) {
    this._context = existingContext ?? new AudioContext();
    this._context.onstatechange = () => {
      if (this._state.get() === "destroyed") return;
      if (this._context.state === "suspended" && this._state.get() === "running") {
        this._state.set("suspended");
      }
    };
    this.setup(this._context);
  }

  get context(): AudioContext {
    return this._context;
  }

  get state(): Signal<EngineState> {
    return this._state;
  }

  untilReady(): Promise<void> {
    if (this._state.get() === "running") return Promise.resolve();
    if (this._cachedPromise) return this._cachedPromise;
    this._cachedPromise = new Promise<void>((resolve) => {
      const eff = effect(() => {
        if (this._state.get() === "running") {
          resolve();
          eff.stop();
        }
      });
    });
    return this._cachedPromise;
  }

  async start(): Promise<void> {
    const s = this._state.get();
    if (s === "running") return;
    if (s === "destroyed") throw new Error("Cannot start a destroyed engine");
    await this._context.resume();
    this._state.set("running");
    this._cachedPromise = null;
  }

  async suspend(): Promise<void> {
    if (this._state.get() === "destroyed") {
      console.warn("AudioEngine: suspend() called on a destroyed engine");
      return;
    }
    if (this._state.get() !== "running") return;
    await this._context.suspend();
    this._state.set("suspended");
  }

  async resume(): Promise<void> {
    if (this._state.get() === "destroyed") {
      console.warn("AudioEngine: resume() called on a destroyed engine");
      return;
    }
    if (this._state.get() !== "suspended") return;
    await this._context.resume();
    this._state.set("running");
    this._cachedPromise = null;
  }

  protected abstract setup(context: AudioContext): void;

  protected register<T extends AudioProcessor>(processor: T): T {
    this._processors.push(processor);
    return processor;
  }

  destroy(): void {
    if (this._state.get() === "destroyed") return;
    for (const p of this._processors) p.destroy();
    this._processors = [];
    this._context.close();
    this._state.set("destroyed");
    this._cachedPromise = null;
  }
}

// --- createEngine factory ---

type ReservedKeys = keyof AudioEngine;

type ValidSetupReturn<T> = {
  [K in keyof T]: K extends ReservedKeys ? never : T[K];
};

const RESERVED_KEYS = new Set<string>(["start", "destroy", "suspend", "resume", "state", "context", "untilReady"]);

export function createEngine<T extends Record<string, unknown>>(
  setup: (context: AudioContext) => ValidSetupReturn<T>,
  options?: { context?: AudioContext },
): AudioEngine & T {
  class SetupEngine extends AudioEngine {
    protected setup(context: AudioContext): void {
      const result = setup(context);

      for (const key of Object.keys(result)) {
        if (RESERVED_KEYS.has(key)) {
          throw new Error(`createEngine: setup returned reserved key "${key}"`);
        }
      }

      for (const value of Object.values(result)) {
        if (value instanceof AudioProcessor) {
          this.register(value);
        }
      }

      Object.assign(this, result);
    }
  }

  return new SetupEngine(options?.context) as AudioEngine & T;
}
