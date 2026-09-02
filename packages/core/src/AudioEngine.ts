import { signal, effect } from "alien-signals";
import { AudioProcessor } from "./AudioProcessor";
import { assertAudioContextAvailable, LatencyUnknownError } from "./errors";
import { defineGraph as defineGraphFn, _graphRegistry } from "./graph";
import type { EdgeList, GraphHandle, GraphOptions } from "./graph";
import { Param } from "./Param";
import type { EngineState, SignalAccessor } from "./types";

const DEFAULT_AUTO_START_EVENTS = ["click", "keydown", "touchstart"] as const;

// Samples from `proc`'s output to the destination of the graph that (transitively)
// owns it. Recurses through a nested processor's own graph via the registry's
// `owner` link, so a processor several composites deep still resolves.
function resolvePathLatency(proc: AudioProcessor): number {
  const entry = _graphRegistry.get(proc);
  if (!entry) {
    throw new LatencyUnknownError(proc.constructor.name);
  }
  const { handle, owner, sink } = entry;
  const pathLatency = handle.arrivalOf(sink) - handle.arrivalOf(proc);
  return owner ? pathLatency + resolvePathLatency(owner) : pathLatency;
}

export class AudioEngine {
  private readonly _context: AudioContext;
  private _processors: AudioProcessor[] = [];
  private _state: SignalAccessor<EngineState> = signal<EngineState>("idle");
  private _cachedPromise: Promise<void> | null = null;
  private _graphs: GraphHandle[] = [];
  // Each engine-owned graph's most recent destination arrival, keyed by an identity
  // token private to that graph — not the graph itself, so a graph whose own last
  // solve didn't touch the destination just keeps its prior entry (or none) instead
  // of clobbering it with `undefined`. `latency` is always the max across this map.
  private _graphLatency = new Map<object, number>();
  readonly latency: Param<number> = new Param({ default: 0 });

  constructor(existingContext?: AudioContext) {
    if (existingContext === undefined) assertAudioContextAvailable();
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

  /** `currentTime` advanced by the root graph's compensated latency and the context's output latency. */
  get perceivedTime(): number {
    const ctx = this._context;
    const outputLatency = "outputLatency" in ctx && typeof ctx.outputLatency === "number" ? ctx.outputLatency : 0;
    return ctx.currentTime + this.latency.value / ctx.sampleRate + outputLatency;
  }

  defineGraph(fn: () => EdgeList, opts?: Omit<GraphOptions, "context">): GraphHandle {
    const token = {};
    const inner = defineGraphFn(fn, {
      ...opts,
      context: this._context,
      onSolve: (h) => {
        try {
          this._graphLatency.set(token, h.arrivalOf(this._context.destination));
        } catch {
          // The destination didn't participate in this solve — keep this graph's
          // previous contribution (or none) rather than dropping it to 0.
        }
        this._recomputeLatency();
        opts?.onSolve?.(h);
      },
    });
    const handle: GraphHandle = {
      dispose: () => {
        inner.dispose();
        this._graphLatency.delete(token);
        this._recomputeLatency();
      },
      arrivalOf: (node) => inner.arrivalOf(node),
    };
    this._graphs.push(handle);
    return handle;
  }

  // `latency` is the longest path into the destination across every engine-owned
  // graph currently live — not just whichever one solved most recently.
  private _recomputeLatency(): void {
    let max = 0;
    for (const v of this._graphLatency.values()) if (v > max) max = v;
    this.latency.value = max;
  }

  /** Samples from `proc`'s output to `ctx.destination`, following its graph ownership chain. */
  getPathLatency(proc: AudioProcessor): number {
    return resolvePathLatency(proc);
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
    for (const graph of this._graphs) graph.dispose();
    this._graphs = [];
    this._graphLatency.clear();
    for (const p of this._processors) p.destroy();
    this._processors = [];
    this.latency.destroy();
    this._context.close();
    this._state("destroyed");
    this._cachedPromise = null;
  }
}

// --- createEngine factory ---

type ValidSetupReturn<T> = {
  [K in keyof T]: K extends "core" ? never : T[K];
};

export interface EngineSetupHelpers {
  defineGraph: AudioEngine["defineGraph"];
}

export function createEngine<T extends Record<string, unknown>>(
  setup: (context: AudioContext, helpers: EngineSetupHelpers) => ValidSetupReturn<T>,
  options?: { context?: AudioContext },
): T & { core: AudioEngine } {
  const engine = new AudioEngine(options?.context);
  const result = setup(engine.context, { defineGraph: (fn, o) => engine.defineGraph(fn, o) });

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
