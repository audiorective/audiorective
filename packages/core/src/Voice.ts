export interface VoiceOptions {
  /** Buffer start offset in seconds. Default 0. */
  offset?: number;
  /** Play length in seconds. Default: to end of buffer. */
  duration?: number;
  /** ctx-time to start. Default: now. */
  when?: number;
  /** Playback rate. Default 1. */
  rate?: number;
  /** Per-voice gain. Default 1. */
  volume?: number;
  /** Loop the whole buffer. Default false. */
  loop?: boolean;
}

/**
 * One live voice: an AudioBufferSourceNode feeding a per-voice gain, summed into
 * a destination node. AudioBufferSourceNode is one-shot by spec, so pause/seek
 * recreate the source at a computed offset. Transient — created per trigger,
 * disposed when it ends.
 */
export class Voice {
  private readonly ctx: AudioContext;
  private readonly buffer: AudioBuffer;
  private readonly gain: GainNode;
  private readonly playLength: number | undefined;
  private readonly onDone: () => void;

  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0; // ctx time the current source started
  private offset: number; // buffer offset the current source started from
  private _rate: number; // underscored: `rate` is a public setter (Task 3)
  private loop: boolean;
  private paused = false;
  private ended = false;
  private endedCbs: Array<() => void> = [];

  constructor(ctx: AudioContext, buffer: AudioBuffer, destination: AudioNode, opts: VoiceOptions, onDone: () => void) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.onDone = onDone;
    this.offset = opts.offset ?? 0;
    this._rate = opts.rate ?? 1;
    this.loop = opts.loop ?? false;
    this.playLength = opts.duration;
    this.gain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    this.gain.connect(destination);
    this.startSource(opts.when ?? ctx.currentTime, this.offset);
  }

  get duration(): number {
    return this.buffer.duration;
  }

  get isPlaying(): boolean {
    return !this.paused && !this.ended;
  }

  get currentTime(): number {
    if (this.paused || this.ended) return this.offset;
    const elapsed = Math.max(0, this.ctx.currentTime - this.startedAt) * this._rate;
    let t = this.offset + elapsed;
    if (this.loop) {
      const len = this.buffer.duration;
      t = len > 0 ? t % len : 0;
    } else {
      t = Math.min(t, this.buffer.duration);
    }
    return t;
  }

  stop(when?: number): void {
    if (this.ended) return;
    if (when != null && when > this.ctx.currentTime && this.source) {
      // Scheduled stop: let it play to `when`; the current source's onended finalizes.
      try {
        this.source.stop(when);
      } catch {
        /* already stopped */
      }
      return;
    }
    this.teardownCurrent();
    this.finish();
  }

  onEnded(cb: () => void): void {
    if (this.ended) cb();
    else this.endedCbs.push(cb);
  }

  private startSource(when: number, offset: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.playbackRate.value = this._rate;
    src.connect(this.gain);
    src.onended = () => {
      // Ignore the onended of a source we already tore down (pause/seek/rate).
      if (src !== this.source) return;
      this.finish();
    };
    if (this.playLength != null) src.start(when, offset, this.playLength);
    else src.start(when, offset);
    this.source = src;
    this.startedAt = when;
    this.offset = offset;
    this.paused = false;
  }

  private teardownCurrent(): void {
    const src = this.source;
    this.source = null; // do this first so the stale onended is ignored
    if (src) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.paused = false;
    this.teardownCurrent();
    this.gain.disconnect();
    const cbs = this.endedCbs;
    this.endedCbs = [];
    for (const cb of cbs) cb();
    this.onDone();
  }
}
