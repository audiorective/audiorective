import { signal, effect } from "alien-signals";
import { AudioProcessor } from "./AudioProcessor";
import type { EngineState, SignalAccessor } from "./types";

const DEFAULT_AUTO_START_EVENTS = ["click", "keydown", "touchstart"] as const;

export class AudioEngine {
  private readonly _context: AudioContext;
  private _processors: AudioProcessor[] = [];
  private _state: SignalAccessor<EngineState> = signal<EngineState>("idle");
  private _cachedPromise: Promise<void> | null = null;

  constructor(existingContext?: AudioContext) {
    this._context = existingContext ?? new AudioContext();
    this._context.onstatechange = () => {
      if (this._state() === "destroyed") return;
      if (this._context.state === "suspended" && this._state() === "running") {
        this._state("suspended");
      }
    };
  }

  get context(): AudioContext {
    return this._context;
  }

  get state(): SignalAccessor<EngineState> {
    return this._state;
  }

  untilReady(): Promise<void> {
    if (this._state() === "running") return Promise.resolve();
    if (this._cachedPromise) return this._cachedPromise;
    this._cachedPromise = new Promise<void>((resolve) => {
      const stop = effect(() => {
        if (this._state() === "running") {
          resolve();
          stop();
        }
      });
    });
    return this._cachedPromise;
  }

  async start(): Promise<void> {
    const s = this._state();
    if (s === "running") return;
    if (s === "destroyed") throw new Error("Cannot start a destroyed engine");
    await this._context.resume();
    this._state("running");
    this._cachedPromise = null;
  }

  async suspend(): Promise<void> {
    if (this._state() === "destroyed") {
      console.warn("AudioEngine: suspend() called on a destroyed engine");
      return;
    }
    if (this._state() !== "running") return;
    await this._context.suspend();
    this._state("suspended");
  }

  async resume(): Promise<void> {
    if (this._state() === "destroyed") {
      console.warn("AudioEngine: resume() called on a destroyed engine");
      return;
    }
    if (this._state() !== "suspended") return;
    await this._context.resume();
    this._state("running");
    this._cachedPromise = null;
  }

  register<T extends AudioProcessor>(processor: T): T {
    this._processors.push(processor);
    return processor;
  }

  autoStart(target: EventTarget, options?: { events?: readonly string[] }): () => void {
    const events = options?.events ?? DEFAULT_AUTO_START_EVENTS;
    let gestureCleanup: (() => void) | null = null;

    const arm = () => {
      if (gestureCleanup) return;
      const handler = () => {
        disarm();
        void this.start();
      };
      for (const ev of events) target.addEventListener(ev, handler);
      gestureCleanup = () => {
        for (const ev of events) target.removeEventListener(ev, handler);
        gestureCleanup = null;
      };
    };

    const disarm = () => {
      gestureCleanup?.();
    };

    const stop = effect(() => {
      const s = this._state();
      if (s === "destroyed") {
        disarm();
        return;
      }
      if (s !== "running") arm();
      else disarm();
    });

    return () => {
      stop();
      disarm();
    };
  }

  destroy(): void {
    if (this._state() === "destroyed") return;
    for (const p of this._processors) p.destroy();
    this._processors = [];
    this._context.close();
    this._state("destroyed");
    this._cachedPromise = null;
  }
}

// --- createEngine factory ---

type ValidSetupReturn<T> = {
  [K in keyof T]: K extends "core" ? never : T[K];
};

export function createEngine<T extends Record<string, unknown>>(
  setup: (context: AudioContext) => ValidSetupReturn<T>,
  options?: { context?: AudioContext },
): T & { core: AudioEngine } {
  const engine = new AudioEngine(options?.context);
  const result = setup(engine.context);

  if ("core" in result) {
    throw new Error('createEngine: setup returned reserved key "core"');
  }

  for (const value of Object.values(result)) {
    if (value instanceof AudioProcessor) {
      engine.register(value);
    }
  }

  return {
    ...result,
    core: engine,
  };
}
