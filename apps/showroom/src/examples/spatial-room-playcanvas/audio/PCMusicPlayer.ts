import * as pc from "playcanvas";
import { Cell } from "@audiorective/core";
import type { Track } from "../../spatial-room/audio/tracks";

export interface TransportState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentTrackIndex: number;
}

/**
 * PlayCanvas-side music player. Mirrors the shape of {@link MusicPlayer} from the
 * Three.js demo but delegates source ownership to PlayCanvas's `SoundComponent`/`SoundSlot`.
 *
 * Tracks are loaded as `pc.Asset`s on demand and assigned to the slot. Transport state
 * is driven by slot events plus a per-frame `currentTime` poll on the active instance.
 *
 * The audiorective EQ chain is wired in separately by `bindEffect(slot, eq, { position: "pre" })`.
 */
export class PCMusicPlayer {
  readonly transport: Cell<TransportState>;
  readonly tracks: Cell<Track[]>;

  private _slot: pc.SoundSlot | null = null;
  private _app: pc.AppBase | null = null;
  private _assets: pc.Asset[] = [];
  private _disposers: Array<() => void> = [];
  private _activeInstance: pc.SoundInstance | null = null;
  private _wasPlayingBeforeSwap = false;

  constructor(initialTracks: Track[]) {
    this.transport = new Cell<TransportState>({
      isPlaying: false,
      currentTime: 0,
      duration: NaN,
      currentTrackIndex: 0,
    });
    this.tracks = new Cell<Track[]>(initialTracks);
  }

  attach(app: pc.AppBase, slot: pc.SoundSlot): void {
    this._app = app;
    this._slot = slot;

    const onPlay = (instance: pc.SoundInstance) => {
      this._activeInstance = instance;
      this.transport.update((d) => {
        d.isPlaying = true;
        const dur = instance.duration;
        if (Number.isFinite(dur) && dur > 0) d.duration = dur;
      });
    };
    const onPause = () => {
      this.transport.update((d) => {
        d.isPlaying = false;
      });
    };
    const onResume = () => {
      this.transport.update((d) => {
        d.isPlaying = true;
      });
    };
    const onStop = () => {
      this._activeInstance = null;
      this.transport.update((d) => {
        d.isPlaying = false;
      });
    };
    const onEnd = () => {
      this._activeInstance = null;
      this.transport.update((d) => {
        d.isPlaying = false;
      });
      // auto-advance on natural end — match the HTMLAudio demo's behaviour
      if (!this._wasPlayingBeforeSwap) this.next();
    };

    slot.on("play", onPlay);
    slot.on("pause", onPause);
    slot.on("resume", onResume);
    slot.on("stop", onStop);
    slot.on("end", onEnd);
    this._disposers.push(() => slot.off("play", onPlay));
    this._disposers.push(() => slot.off("pause", onPause));
    this._disposers.push(() => slot.off("resume", onResume));
    this._disposers.push(() => slot.off("stop", onStop));
    this._disposers.push(() => slot.off("end", onEnd));

    const onUpdate = () => {
      const inst = this._activeInstance;
      if (!inst) return;
      const t = inst.currentTime;
      if (this.transport.value.currentTime !== t) {
        this.transport.update((d) => {
          d.currentTime = t;
        });
      }
    };
    app.on("update", onUpdate);
    this._disposers.push(() => app.off("update", onUpdate));

    if (this.tracks.value.length > 0) {
      this.loadTrack(this.transport.value.currentTrackIndex);
    }
  }

  detach(): void {
    for (const d of this._disposers.splice(0)) {
      try {
        d();
      } catch {
        // ignore
      }
    }
    if (this._slot) {
      this._slot.stop();
    }
    this._slot = null;
    this._app = null;
    this._activeInstance = null;
    for (const a of this._assets) {
      a.unload();
    }
    this._assets = [];
  }

  play(): void {
    if (!this._slot) return;
    this._slot.play();
  }

  pause(): void {
    this._slot?.pause();
  }

  resume(): void {
    this._slot?.resume();
  }

  seek(t: number): void {
    const inst = this._activeInstance;
    if (!inst) return;
    const d = inst.duration;
    if (Number.isFinite(d)) {
      inst.currentTime = Math.max(0, Math.min(d, t));
    }
  }

  loadTrack(i: number): void {
    if (!this._app || !this._slot) return;
    const list = this.tracks.value;
    if (list.length === 0) return;
    const idx = ((i % list.length) + list.length) % list.length;
    const track = list[idx]!;

    this._wasPlayingBeforeSwap = this.transport.value.isPlaying;
    this._slot.stop();

    this.transport.update((d) => {
      d.currentTrackIndex = idx;
      d.currentTime = 0;
      d.duration = NaN;
    });

    const asset = new pc.Asset(track.title || `track-${idx}`, "audio", { url: track.src });
    this._app.assets.add(asset);
    this._assets.push(asset);
    asset.ready(() => {
      if (!this._slot || this._slot.asset === asset.id) return;
      this._slot.asset = asset.id;
      const sound = asset.resource as pc.Sound | undefined;
      if (sound && Number.isFinite(sound.duration)) {
        this.transport.update((d) => {
          d.duration = sound.duration;
        });
      }
      if (this._wasPlayingBeforeSwap) {
        this._wasPlayingBeforeSwap = false;
        this._slot.play();
      }
    });
    this._app.assets.load(asset);
  }

  next(): void {
    this.loadTrack(this.transport.value.currentTrackIndex + 1);
  }

  prev(): void {
    this.loadTrack(this.transport.value.currentTrackIndex - 1);
  }
}
