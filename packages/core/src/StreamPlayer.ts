import { AudioProcessor } from "./AudioProcessor";
import type { SchedulableParam } from "./SchedulableParam";
import type { Cell } from "./Cell";

export interface StreamPlayerOptions {
  /** Stream URL. Settable later via `.src`. */
  src?: string;
  /** Loop the stream (sets audio.loop). Default false. */
  loop?: boolean;
  /** Output gain (0..1). Default 1. */
  volume?: number;
  /** Playback rate. Default 1. */
  playbackRate?: number;
  /** Element crossOrigin (needed for MediaElementSource on remote URLs). Default "anonymous". */
  crossOrigin?: string | null;
  /** Element preload hint. Default "metadata". */
  preload?: "none" | "metadata" | "auto";
}

/**
 * Streaming sound source — the "track". You operate it: play/pause/seek/stop
 * over a single moving playhead, with reactive isPlaying/currentTime/duration.
 * Backed by an HTMLAudioElement (streams; no full decode) — for music and
 * long-form audio. For polyphonic SFX, use SoundPlayer. Spatial/EQ compose
 * externally via `player.output -> ...`.
 */
export class StreamPlayer extends AudioProcessor<
  { volume: SchedulableParam },
  { isPlaying: Cell<boolean>; currentTime: Cell<number>; duration: Cell<number> }
> {
  /**
   * The underlying media element — a deliberate escape hatch for advanced needs
   * (e.g. reading `audio.paused` for synchronous play-state, or native attrs the
   * wrapper doesn't surface). The internal event listeners keep the reactive
   * cells in sync even if a caller drives the element directly.
   */
  readonly audio: HTMLAudioElement;

  private readonly _source: MediaElementAudioSourceNode;
  private readonly _output: GainNode;
  private readonly _disposers: Array<() => void> = [];
  private readonly _endedCbs: Array<() => void> = [];
  private _src: string | null = null;

  constructor(ctx: AudioContext, opts: StreamPlayerOptions = {}) {
    const audio = new Audio();
    audio.crossOrigin = opts.crossOrigin === undefined ? "anonymous" : opts.crossOrigin;
    audio.preload = opts.preload ?? "metadata";
    audio.loop = opts.loop ?? false;
    audio.playbackRate = opts.playbackRate ?? 1;

    const source = ctx.createMediaElementSource(audio);
    const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    source.connect(outputGain);

    super(ctx, ({ param, cell }) => ({
      params: { volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }) },
      cells: { isPlaying: cell(false), currentTime: cell(0), duration: cell(NaN) },
    }));

    this.audio = audio;
    this._source = source;
    this._output = outputGain;

    const on = (type: string, fn: () => void) => {
      audio.addEventListener(type, fn);
      this._disposers.push(() => audio.removeEventListener(type, fn));
    };
    on("play", () => {
      this.cells.isPlaying.value = true;
    });
    on("playing", () => {
      this.cells.isPlaying.value = true;
    });
    on("pause", () => {
      this.cells.isPlaying.value = false;
    });
    on("timeupdate", () => {
      this.cells.currentTime.value = audio.currentTime;
    });
    on("seeking", () => {
      this.cells.currentTime.value = audio.currentTime;
    });
    on("loadedmetadata", () => {
      this.cells.duration.value = audio.duration;
    });
    on("ended", () => {
      this.cells.isPlaying.value = false;
      for (const cb of [...this._endedCbs]) cb();
    });

    if (opts.src != null) this.src = opts.src;
  }

  get output(): AudioNode {
    return this._output;
  }

  get src(): string | null {
    return this._src;
  }

  set src(url: string | null) {
    this._src = url;
    this.audio.pause();
    if (url == null) this.audio.removeAttribute("src");
    else this.audio.src = url;
    this.audio.load();
    this.cells.isPlaying.value = false;
    this.cells.currentTime.value = 0;
    this.cells.duration.value = NaN;
  }

  set loop(v: boolean) {
    this.audio.loop = v;
  }

  set playbackRate(v: number) {
    this.audio.playbackRate = v;
  }

  async play(): Promise<void> {
    if (!this.audio.src) return;
    try {
      await this.audio.play();
    } catch (e) {
      // Benign: autoplay needs a user gesture (NotAllowedError), or play() was
      // interrupted by a src change / pause (AbortError, e.g. during track switch).
      // Surface anything else (bad codec, network, …).
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) return;
      throw e;
    }
  }

  pause(): void {
    this.audio.pause();
  }

  seek(t: number): void {
    const d = this.audio.duration;
    const clamped = Math.max(0, Number.isFinite(d) ? Math.min(d, t) : t);
    this.audio.currentTime = clamped;
    this.cells.currentTime.value = this.audio.currentTime;
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.cells.isPlaying.value = false;
    this.cells.currentTime.value = 0;
  }

  onEnded(cb: () => void): void {
    this._endedCbs.push(cb);
  }

  override destroy(): void {
    this.audio.pause();
    for (const d of this._disposers.splice(0)) d();
    this._endedCbs.length = 0;
    this._source.disconnect();
    this._output.disconnect();
    this.audio.removeAttribute("src");
    this.audio.load();
    this._src = null;
    super.destroy();
  }
}
