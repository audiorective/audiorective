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
 * One live voice: an AudioBufferSourceNode summed into a destination node.
 * AudioBufferSourceNode is one-shot by spec, so pause/seek recreate the source
 * at a computed offset. Transient — created per trigger, disposed when it ends.
 *
 * The per-voice GainNode is lazy: at unity volume the source connects straight
 * to the destination (no extra node on the hot path); a gain is created only
 * when a non-unity volume is set.
 */
export class Voice {
  private readonly ctx: BaseAudioContext;
  private readonly buffer: AudioBuffer;
  private readonly destination: AudioNode;
  private gain: GainNode | null = null;
  private readonly playLength: number | undefined;
  private readonly onDone: () => void;

  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0; // ctx time the current source started
  private offset: number; // buffer offset the current source started from
  private _rate: number; // underscored: `rate` is a public setter (Task 3)
  private loop: boolean;
  private paused = false;
  private ended = false;
  private stopScheduled = false; // a future-dated stop(when) is pending; transport ops are frozen until it fires
  private endedCbs: Array<() => void> = [];

  constructor(ctx: BaseAudioContext, buffer: AudioBuffer, destination: AudioNode, opts: VoiceOptions, onDone: () => void) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.destination = destination;
    this.onDone = onDone;
    this.offset = opts.offset ?? 0;
    this._rate = opts.rate ?? 1;
    this.loop = opts.loop ?? false;
    this.playLength = opts.duration;
    if (opts.volume != null && opts.volume !== 1) {
      this.gain = this.makeGain(opts.volume);
    }
    this.startSource(opts.when ?? ctx.currentTime, this.offset);
  }

  /** The node the source feeds: the per-voice gain if present, else the destination directly. */
  private get sink(): AudioNode {
    return this.gain ?? this.destination;
  }

  private makeGain(value: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = value;
    gain.connect(this.destination);
    return gain;
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
      const end = this.playLength != null ? Math.min(this.buffer.duration, this.offset + this.playLength) : this.buffer.duration;
      t = Math.min(t, end);
    }
    return t;
  }

  stop(when?: number): void {
    if (this.ended) return;
    if (when != null && when > this.ctx.currentTime && this.source) {
      // Scheduled stop: let it play to `when`; the current source's onended finalizes.
      this.stopScheduled = true;
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

  pause(): void {
    if (this.paused || this.ended || this.stopScheduled || !this.source) return;
    this.offset = this.currentTime; // capture before tearing down
    this.paused = true;
    this.teardownCurrent();
  }

  resume(): void {
    if (!this.paused || this.ended || this.stopScheduled) return;
    this.startSource(this.ctx.currentTime, this.offset);
  }

  seek(t: number): void {
    if (this.ended || this.stopScheduled) return;
    const clamped = Math.max(0, Math.min(t, this.buffer.duration));
    if (this.paused) {
      this.offset = clamped;
      return;
    }
    this.teardownCurrent();
    this.startSource(this.ctx.currentTime, clamped);
  }

  set volume(v: number) {
    if (this.ended) return;
    if (this.gain) {
      this.gain.gain.value = v;
      return;
    }
    if (v === 1) return; // unity — no gain node needed
    // Splice a gain between the (current) source and the destination.
    const gain = this.makeGain(v);
    this.gain = gain;
    if (this.source) {
      this.source.disconnect();
      this.source.connect(gain);
    }
  }

  set rate(v: number) {
    if (this.ended || this.stopScheduled) return;
    if (this.paused || !this.source) {
      this._rate = v;
      return;
    }
    // Rebase the offset baseline so currentTime stays continuous across the change.
    this.offset = this.currentTime;
    this.startedAt = this.ctx.currentTime;
    this._rate = v;
    this.source.playbackRate.value = v;
  }

  private startSource(when: number, offset: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.playbackRate.value = this._rate;
    src.connect(this.sink);
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
    this.offset = this.currentTime; // capture final position before the ended flag flips currentTime to return this.offset
    this.ended = true;
    this.paused = false;
    this.teardownCurrent();
    this.gain?.disconnect();
    const cbs = this.endedCbs;
    this.endedCbs = [];
    for (const cb of cbs) cb();
    this.onDone();
  }
}
