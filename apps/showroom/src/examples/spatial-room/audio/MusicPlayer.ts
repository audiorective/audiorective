import { AudioProcessor } from "@audiorective/core";
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

export class MusicPlayer extends AudioProcessor<Record<string, never>, Cells> {
  readonly audio: HTMLAudioElement;
  readonly eq: EQ3;

  constructor(ctx: AudioContext, initialTracks: Track[]) {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";

    const source = ctx.createMediaElementSource(audio);
    const eq = new EQ3(ctx);
    source.connect(eq.input);

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

    this.audio = audio;
    this.eq = eq;

    audio.addEventListener("play", () => {
      this.cells.transport.update((d) => {
        d.isPlaying = true;
      });
    });
    audio.addEventListener("pause", () => {
      this.cells.transport.update((d) => {
        d.isPlaying = false;
      });
    });
    audio.addEventListener("timeupdate", () => {
      this.cells.transport.update((d) => {
        d.currentTime = audio.currentTime;
      });
    });
    audio.addEventListener("loadedmetadata", () => {
      this.cells.transport.update((d) => {
        d.duration = audio.duration;
      });
    });
    audio.addEventListener("ended", () => {
      this.next();
    });

    if (initialTracks.length > 0) this.loadTrack(0);
  }

  get output(): AudioNode {
    return this.eq.output;
  }

  async play(): Promise<void> {
    if (!this.audio.src) return;
    try {
      await this.audio.play();
    } catch {
      // user gesture pending; UI will trigger again
    }
  }

  pause(): void {
    this.audio.pause();
  }

  seek(t: number): void {
    const d = this.audio.duration;
    if (Number.isFinite(d)) {
      this.audio.currentTime = Math.max(0, Math.min(d, t));
    }
  }

  loadTrack(i: number): void {
    const list = this.cells.tracks.value;
    if (list.length === 0) return;
    const idx = ((i % list.length) + list.length) % list.length;
    const track = list[idx]!;
    const wasPlaying = !this.audio.paused;
    this.audio.pause();
    this.audio.src = track.src;
    this.audio.load();
    this.cells.transport.update((d) => {
      d.currentTrackIndex = idx;
      d.currentTime = 0;
      d.duration = NaN;
    });
    if (wasPlaying) {
      const onCanPlay = () => {
        this.audio.play().catch(() => {});
      };
      this.audio.addEventListener("canplay", onCanPlay, { once: true });
    }
  }

  next(): void {
    this.loadTrack(this.cells.transport.value.currentTrackIndex + 1);
  }

  prev(): void {
    this.loadTrack(this.cells.transport.value.currentTrackIndex - 1);
  }

  override destroy(): void {
    super.destroy();
    this.eq.destroy();
  }
}
