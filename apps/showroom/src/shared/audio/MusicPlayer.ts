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

    // Mirror the StreamPlayer's transport cells into the combined transport
    // state, preserving currentTrackIndex (owned by the playlist below).
    this.effect(() => {
      const isPlaying = stream.cells.isPlaying.$();
      const currentTime = stream.cells.currentTime.$();
      const duration = stream.cells.duration.$();
      this.cells.transport.update((d) => {
        d.isPlaying = isPlaying;
        d.currentTime = currentTime;
        d.duration = duration;
      });
    });

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
    const wasPlaying = this.cells.transport.value.isPlaying;
    this.stream.src = track.src;
    this.cells.transport.update((d) => {
      d.currentTrackIndex = idx;
    });
    if (wasPlaying) void this.stream.play();
  }

  next(): void {
    this.loadTrack(this.cells.transport.value.currentTrackIndex + 1);
  }

  prev(): void {
    this.loadTrack(this.cells.transport.value.currentTrackIndex - 1);
  }

  override destroy(): void {
    super.destroy();
    this.stream.destroy();
    this.eq.destroy();
  }
}
