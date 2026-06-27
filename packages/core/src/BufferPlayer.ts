import { AudioProcessor } from "./AudioProcessor";
import type { SchedulableParam } from "./SchedulableParam";
import type { Cell } from "./Cell";

export interface BufferPlayerOptions {
  /** Decoded sample. Settable later via `.buffer` (applies on next start). */
  buffer?: AudioBuffer;
  /** Loop the buffer. Default false. */
  loop?: boolean;
  /** Loop start in seconds. Default 0. */
  loopStart?: number;
  /** Loop end in seconds. Default 0 → falls back to buffer end (musical-loop / decode-tail guard). */
  loopEnd?: number;
  /** Starting playback rate; also the rate a restart re-anchors to. Default 1. */
  playbackRate?: number;
  /** Output gain (0..1). Default 1. */
  volume?: number;
}

/**
 * Buffer-backed single-playhead transport — the "deck". One persistent source
 * you start(), stop(), and loop, on the sample-accurate AudioContext clock. Unlike
 * Sampler (polyphonic, fire-and-forget voices), the source lives for the whole
 * play session, so its `rate` is a real schedulable AudioParam you can ramp for
 * tempo/pitch moves (spin-down, tempo-match). For SFX/one-shots use Sampler;
 * for long-form streamed files use FilePlayer.
 *
 * The source node is one-shot (an AudioBufferSourceNode can't restart), so each
 * start() builds a fresh node and `rate` is rebound to its playbackRate — see
 * SchedulableParam.rebind. Scheduled rate automation belongs to the current play
 * session; stop() ends it and the next start() re-anchors to the base rate.
 */
export class BufferPlayer extends AudioProcessor<{ volume: SchedulableParam; rate: SchedulableParam }, { isPlaying: Cell<boolean> }> {
  /** Hot-swappable; the new buffer takes effect on the next start(). */
  buffer: AudioBuffer | null;

  private readonly _output: GainNode;
  private readonly _baseRate: number;
  private _loop: boolean;
  private _loopStart: number;
  private _loopEnd: number;
  private _source: AudioBufferSourceNode | null = null;

  constructor(ctx: AudioContext, opts: BufferPlayerOptions = {}) {
    const output = new GainNode(ctx, { gain: opts.volume ?? 1 });
    super(ctx, ({ param, schedulableParam, cell }) => ({
      params: {
        volume: param({ default: opts.volume ?? 1, bind: output.gain, min: 0, max: 1 }),
        // Unbound until the first start() rebinds it to a live source.playbackRate.
        rate: schedulableParam({ default: opts.playbackRate ?? 1 }),
      },
      cells: { isPlaying: cell(false) },
    }));
    this._output = output;
    this.buffer = opts.buffer ?? null;
    this._baseRate = opts.playbackRate ?? 1;
    this._loop = opts.loop ?? false;
    this._loopStart = opts.loopStart ?? 0;
    this._loopEnd = opts.loopEnd ?? 0;
  }

  get output(): AudioNode {
    return this._output;
  }

  /**
   * Begin playback at ctx-time `when` (default now), from buffer `offset` seconds.
   * A no-op if already playing or no buffer is set (single live source).
   */
  start(when: number = this.context.currentTime, offset = 0): void {
    if (this._source || !this.buffer) return;
    const src = new AudioBufferSourceNode(this.context, {
      buffer: this.buffer,
      loop: this._loop,
      playbackRate: this._baseRate,
    });
    if (this._loop) {
      src.loopStart = this._loopStart;
      src.loopEnd = this._loopEnd || this.buffer.duration;
    }
    src.connect(this._output);
    src.onended = () => {
      if (src === this._source) this._finish();
    };

    // Re-point `rate` at the fresh node's playbackRate, then anchor to the base
    // rate. reassert:false — the value is set explicitly on the next line, so we
    // skip mirroring any leftover (e.g. spun-down) signal value onto the new node.
    this.params.rate.rebind(src.playbackRate, { reassert: false });
    this.params.rate.value = this._baseRate;

    src.start(when, offset);
    this._source = src;
    this.cells.isPlaying.value = true;
  }

  /**
   * Stop playback. With a future `when`, the source plays until then and its
   * natural end finalizes state; immediate stop tears down now.
   */
  stop(when?: number): void {
    const src = this._source;
    if (!src) return;
    if (when != null && when > this.context.currentTime) {
      try {
        src.stop(when);
      } catch {
        /* already stopped */
      }
      return; // onended at `when` runs _finish
    }
    this._source = null; // null first so the scheduled onended is ignored as stale
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    src.disconnect();
    this.cells.isPlaying.value = false;
  }

  set loop(v: boolean) {
    this._loop = v;
    if (this._source) this._source.loop = v;
  }
  set loopStart(v: number) {
    this._loopStart = v;
    if (this._source) this._source.loopStart = v;
  }
  set loopEnd(v: number) {
    this._loopEnd = v;
    if (this._source) this._source.loopEnd = v || this.buffer?.duration || 0;
  }

  override destroy(): void {
    this.stop();
    this._output.disconnect();
    super.destroy();
  }

  private _finish(): void {
    this._source?.disconnect();
    this._source = null;
    this.cells.isPlaying.value = false;
  }
}
