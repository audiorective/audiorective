import type { SchedulableParam } from "./SchedulableParam";

/**
 * Per-AudioContext singleton that periodically reads AudioParam values
 * back into their SchedulableParam signals, keeping the reactive layer
 * in sync with the audio thread at a configurable per-param rate
 * (~10 Hz by default).
 */

export const DEFAULT_SYNC_INTERVAL_MS = 100; // ~10Hz

interface ParamEntry {
  intervalMs: number;
  lastSyncTime: number;
}

const paramSyncInstances = new WeakMap<BaseAudioContext, ParamSync>();

export class ParamSync {
  private readonly _params = new Map<SchedulableParam, ParamEntry>();
  private _rafId: number | null = null;

  static for(ctx: BaseAudioContext): ParamSync {
    let instance = paramSyncInstances.get(ctx);
    if (!instance) {
      instance = new ParamSync();
      paramSyncInstances.set(ctx, instance);
    }
    return instance;
  }

  private constructor() {}

  register(param: SchedulableParam, intervalMs = DEFAULT_SYNC_INTERVAL_MS): void {
    this._params.set(param, { intervalMs, lastSyncTime: 0 });
    if (this._params.size === 1) this._start();
  }

  unregister(param: SchedulableParam): void {
    this._params.delete(param);
    if (this._params.size === 0) this._stop();
  }

  get size(): number {
    return this._params.size;
  }

  get running(): boolean {
    return this._rafId !== null;
  }

  private _start(): void {
    if (this._rafId !== null) return;
    this._loop();
  }

  private _stop(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _loop = (): void => {
    const now = performance.now();
    for (const [param, entry] of this._params) {
      if (now - entry.lastSyncTime >= entry.intervalMs) {
        entry.lastSyncTime = now;
        param.syncFromAudio();
      }
    }
    this._rafId = requestAnimationFrame(this._loop);
  };
}
