export interface TickSource {
  start(onTick: () => void): void;
  stop(): void;
}

/** Tests drive ticks by hand — fully deterministic, no timers. */
export class ManualTickSource implements TickSource {
  private _onTick?: () => void;
  private _running = false;

  start(onTick: () => void): void {
    this._onTick = onTick;
    this._running = true;
  }

  stop(): void {
    this._running = false;
    this._onTick = undefined;
  }

  tick(): void {
    if (this._running) this._onTick?.();
  }
}

/** setInterval-based fallback for environments without Worker. */
export class IntervalTickSource implements TickSource {
  private readonly _intervalMs: number;
  private _handle: ReturnType<typeof setInterval> | undefined;

  constructor(intervalMs: number) {
    this._intervalMs = intervalMs;
  }

  start(onTick: () => void): void {
    this._handle = setInterval(onTick, this._intervalMs);
  }

  stop(): void {
    if (this._handle !== undefined) clearInterval(this._handle);
    this._handle = undefined;
  }
}

const WORKER_SOURCE = `
let handle;
self.onmessage = (e) => {
  if (e.data === "stop") {
    clearInterval(handle);
    return;
  }
  handle = setInterval(() => self.postMessage("tick"), e.data);
};
`;

/**
 * Web-Worker-based timer so ticks continue in background tabs (main-thread
 * setInterval/rAF throttles heavily when a tab is backgrounded). Falls back
 * to IntervalTickSource when Worker is unavailable.
 */
export class WorkerTickSource implements TickSource {
  private readonly _intervalMs: number;
  private _worker: Worker | undefined;
  private _fallback: IntervalTickSource | undefined;

  constructor(intervalMs: number) {
    this._intervalMs = intervalMs;
  }

  start(onTick: () => void): void {
    if (typeof Worker === "undefined") {
      this._fallback = new IntervalTickSource(this._intervalMs);
      this._fallback.start(onTick);
      return;
    }
    const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    this._worker = new Worker(url);
    URL.revokeObjectURL(url);
    this._worker.onmessage = () => onTick();
    this._worker.postMessage(this._intervalMs);
  }

  stop(): void {
    if (this._worker) {
      this._worker.postMessage("stop");
      this._worker.terminate();
      this._worker = undefined;
    }
    this._fallback?.stop();
    this._fallback = undefined;
  }
}
