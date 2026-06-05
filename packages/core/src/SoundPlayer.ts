import { AudioProcessor } from "./AudioProcessor";
import type { SchedulableParam } from "./SchedulableParam";
import type { Cell } from "./Cell";
import { Voice, type VoiceOptions } from "./Voice";

export interface SoundPlayerOptions {
  /** Decoded sample. Settable later via `.buffer`. */
  buffer?: AudioBuffer;
  /** Default loop for new voices. Default false. */
  loop?: boolean;
  /** Default playback rate for new voices. Default 1. */
  playbackRate?: number;
  /** Player output gain (0..1). Default 1. */
  volume?: number;
  /** Max concurrent voices. Default 1. */
  polyphony?: number;
  /** At the cap: stop the oldest then spawn, or drop the new trigger. Default "oldest". */
  steal?: "oldest" | "none";
}

export type TriggerOptions = VoiceOptions;

/**
 * Buffer-backed, polyphonic sound source. Spawns Voices that sum into the
 * player output. Exposes a polyphonic/SFX API (trigger -> Voice) and song-style
 * transport (play/pause/resume/seek/stop) over a "current voice". Spatial
 * composes externally via `player.output -> spatial.input`.
 */
export class SoundPlayer extends AudioProcessor<{ volume: SchedulableParam }, { isPlaying: Cell<boolean>; activeVoices: Cell<number> }> {
  buffer: AudioBuffer | null;

  private readonly _output: GainNode;
  private readonly _loop: boolean;
  private readonly _rate: number;
  private readonly _polyphony: number;
  private readonly _steal: "oldest" | "none";
  private _voices: Voice[] = [];
  private _current: Voice | null = null;

  constructor(ctx: AudioContext, opts: SoundPlayerOptions = {}) {
    const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    super(ctx, ({ param, cell }) => ({
      params: { volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }) },
      cells: { isPlaying: cell(false), activeVoices: cell(0) },
    }));
    this._output = outputGain;
    this.buffer = opts.buffer ?? null;
    this._loop = opts.loop ?? false;
    this._rate = opts.playbackRate ?? 1;
    this._polyphony = Math.max(1, opts.polyphony ?? 1);
    this._steal = opts.steal ?? "oldest";
  }

  get output(): AudioNode {
    return this._output;
  }

  get currentTime(): number {
    return this._current?.currentTime ?? 0;
  }

  get duration(): number {
    return this._current?.duration ?? this.buffer?.duration ?? 0;
  }

  trigger(opts: TriggerOptions = {}): Voice | null {
    if (!this.buffer) {
      console.warn("SoundPlayer.trigger: no buffer set");
      return null;
    }
    if (this._voices.length >= this._polyphony) {
      if (this._steal === "none") return null;
      this._voices[0]!.stop(); // synchronous finish -> _evict
    }
    const voiceOpts: VoiceOptions = {
      offset: opts.offset,
      duration: opts.duration,
      when: opts.when,
      rate: opts.rate ?? this._rate,
      volume: opts.volume,
      loop: opts.loop ?? this._loop,
    };
    const voice = new Voice(this.context, this.buffer, this._output, voiceOpts, () => this._evict(voice));
    this._voices.push(voice);
    this._current = voice;
    this.cells.activeVoices.value = this._voices.length;
    this.cells.isPlaying.value = true;
    return voice;
  }

  stopAll(when?: number): void {
    // Cell + _current updates are driven by each voice's _evict callback, so they
    // stay accurate for future-dated stops (voices keep playing until `when`).
    for (const v of [...this._voices]) v.stop(when);
  }

  override destroy(): void {
    this.stopAll();
    this._output.disconnect();
    super.destroy();
  }

  private _evict(voice: Voice): void {
    const i = this._voices.indexOf(voice);
    if (i !== -1) this._voices.splice(i, 1);
    if (this._current === voice) {
      this._current = null;
      this.cells.isPlaying.value = false;
    }
    this.cells.activeVoices.value = this._voices.length;
  }
}
