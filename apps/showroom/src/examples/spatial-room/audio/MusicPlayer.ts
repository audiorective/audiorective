import { AudioProcessor } from "@audiorective/core";
import type { Cell, SchedulableParam } from "@audiorective/core";
import type { Track } from "./tracks";

export interface TransportState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentTrackIndex: number;
}

type Params = {
  masterVolume: SchedulableParam;
  eqLow: SchedulableParam;
  eqMid: SchedulableParam;
  eqHigh: SchedulableParam;
};

type Cells = {
  transport: Cell<TransportState>;
  tracks: Cell<Track[]>;
};

export class MusicPlayer extends AudioProcessor<Params, Cells> {
  readonly audio: HTMLAudioElement;
  private readonly _master: GainNode;

  constructor(ctx: AudioContext, initialTracks: Track[]) {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";

    const source = ctx.createMediaElementSource(audio);
    const low = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 250 });
    const mid = new BiquadFilterNode(ctx, { type: "peaking", frequency: 1000, Q: 1 });
    const high = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 4000 });
    const master = new GainNode(ctx, { gain: 0.8 });
    source.connect(low).connect(mid).connect(high).connect(master);

    super(ctx, ({ param, cell }) => ({
      params: {
        masterVolume: param({ default: 0.8, min: 0, max: 1, bind: master.gain }),
        eqLow: param({ default: 0, min: -12, max: 12, bind: low.gain }),
        eqMid: param({ default: 0, min: -12, max: 12, bind: mid.gain }),
        eqHigh: param({ default: 0, min: -12, max: 12, bind: high.gain }),
      },
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
    this._master = master;

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
    return this._master;
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
}
