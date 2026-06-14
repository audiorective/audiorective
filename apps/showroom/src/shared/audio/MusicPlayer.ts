import { AudioProcessor, StreamPlayer } from "@audiorective/core";
import type { Cell } from "@audiorective/core";
import type { Track } from "./tracks";
import { EQ3 } from "./EQ3";

export interface TransportState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentTrackIndex: number;
}

type Cells = {
  transport: Cell<TransportState>;
  tracks: Cell<Track[]>;
};

/**
 * Demo music player: a core StreamPlayer (streaming transport) feeding a 3-band
 * EQ, with playlist management on top. Public API is unchanged from the original
 * HTMLAudio-based implementation, so the demos consume it identically.
 */
export class MusicPlayer extends AudioProcessor<Record<string, never>, Cells> {
  readonly stream: StreamPlayer;
  readonly eq: EQ3;

  /** Source of truth for the playlist position (kept out of the transport cell's read path). */
  private _trackIndex = 0;

  constructor(ctx: AudioContext, initialTracks: Track[]) {
    const stream = new StreamPlayer(ctx);
    const eq = new EQ3(ctx);
    stream.output.connect(eq.input);

    super(ctx, ({ cell }) => ({
      cells: {
        transport: cell<TransportState>({
          isPlaying: false,
          currentTime: 0,
          duration: NaN,
          currentTrackIndex: 0,
        }),
        tracks: cell<Track[]>(initialTracks),
      },
    }));

    this.stream = stream;
    this.eq = eq;

    // One-way mirror: depends on the stream's transport cells and writes a fresh
    // combined transport object. It never READS `transport`, so the effect can't
    // self-subscribe; `currentTrackIndex` comes from the plain `_trackIndex`.
    this.effect(() => this.syncTransport());

    stream.onEnded(() => this.next());

    if (initialTracks.length > 0) this.loadTrack(0);
  }

  get output(): AudioNode {
    return this.eq.output;
  }

  async play(): Promise<void> {
    await this.stream.play();
  }

  pause(): void {
    this.stream.pause();
  }

  seek(t: number): void {
    this.stream.seek(t);
  }

  loadTrack(i: number): void {
    const list = this.cells.tracks.value;
    if (list.length === 0) return;
    const idx = ((i % list.length) + list.length) % list.length;
    const track = list[idx]!;
    const wasPlaying = !this.stream.audio.paused;
    this._trackIndex = idx;
    this.stream.src = track.src; // resets the stream cells -> effect re-syncs transport
    this.syncTransport(); // push the new currentTrackIndex immediately
    if (wasPlaying) void this.stream.play();
  }

  next(): void {
    this.loadTrack(this._trackIndex + 1);
  }

  prev(): void {
    this.loadTrack(this._trackIndex - 1);
  }

  override destroy(): void {
    super.destroy();
    this.stream.destroy();
    this.eq.destroy();
  }

  /** Write the combined transport from the stream cells + the playlist index. */
  private syncTransport(): void {
    this.cells.transport.value = {
      isPlaying: this.stream.cells.isPlaying.value,
      currentTime: this.stream.cells.currentTime.value,
      duration: this.stream.cells.duration.value,
      currentTrackIndex: this._trackIndex,
    };
  }
}
