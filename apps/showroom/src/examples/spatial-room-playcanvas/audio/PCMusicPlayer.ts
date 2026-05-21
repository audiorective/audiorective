import * as pc from "playcanvas";
import { Cell } from "@audiorective/core";
import { createAudiorectiveSlot, type AudiorectiveSoundSlot } from "@audiorective/playcanvas";
import { EQ3 } from "../../spatial-room/audio/EQ3";
import type { Track } from "../../spatial-room/audio/tracks";

export interface TransportState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentTrackIndex: number;
}

interface TrackChain {
  track: Track;
  slot: AudiorectiveSoundSlot;
  eq: EQ3;
  asset: pc.Asset | null;
  pendingPlay: boolean;
}

/**
 * PlayCanvas-side music player with **per-track audiorective chains**.
 *
 * Each track owns its own `SoundSlot` + `EQ3`, wired at slot construction via
 * `createAudiorectiveSlot`. Track selection is purely UI routing of slider
 * params to the active track's EQ — moving sliders on track 1 never bleeds
 * into track 2.
 *
 * PlayCanvas's `SoundComponent` still owns source + spatializer (PannerNode +
 * listener); audiorective owns each chain's EQ pre-panner.
 */
export class PCMusicPlayer {
  readonly transport: Cell<TransportState>;
  readonly tracks: Cell<Track[]>;
  /** Index into {@link chains} of the track whose EQ the UI edits. */
  readonly activeEqIndex: Cell<number>;

  private readonly _ctx: AudioContext;
  private _app: pc.AppBase | null = null;
  private _component: pc.SoundComponent | null = null;
  private _chains: TrackChain[] = [];
  private _activeInstance: pc.SoundInstance | null = null;
  private _disposers: Array<() => void> = [];
  private _nextSlotId = 0;
  // Tracks added before attach() — drained once the component is available.
  private _pendingTracks: Track[] = [];

  constructor(ctx: AudioContext) {
    this._ctx = ctx;
    this.transport = new Cell<TransportState>({
      isPlaying: false,
      currentTime: 0,
      duration: NaN,
      currentTrackIndex: 0,
    });
    this.tracks = new Cell<Track[]>([]);
    this.activeEqIndex = new Cell<number>(0);
  }

  attach(app: pc.AppBase, component: pc.SoundComponent): void {
    this._app = app;
    this._component = component;

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

    const pending = this._pendingTracks.splice(0);
    for (const track of pending) this.addTrack(track);
  }

  detach(): void {
    for (const d of this._disposers.splice(0)) {
      try {
        d();
      } catch {
        // ignore
      }
    }
    while (this._chains.length > 0) {
      this._destroyChain(this._chains.length - 1);
    }
    this._component = null;
    this._app = null;
    this._activeInstance = null;
  }

  /**
   * Append a track, building its own slot + EQ chain. If called before
   * `attach()`, the track is queued and built when the component is available.
   */
  addTrack(track: Track): void {
    if (!this._component || !this._app) {
      this._pendingTracks.push(track);
      return;
    }

    const eq = new EQ3(this._ctx);
    const slot = createAudiorectiveSlot(
      this._component,
      `track-${this._nextSlotId++}`,
      { volume: 1, loop: false, overlap: false },
      { processor: eq },
    );
    if (!slot) {
      eq.destroy();
      return;
    }

    const chain: TrackChain = { track, slot, eq, asset: null, pendingPlay: false };
    this._wireSlot(chain);
    this._chains.push(chain);
    this.tracks.update((d) => {
      d.push(track);
    });
  }

  /** Remove the track at `index`, tearing down its chain. */
  removeTrack(index: number): void {
    if (index < 0 || index >= this._chains.length) return;
    this._destroyChain(index);
    this.tracks.update((d) => {
      d.splice(index, 1);
    });

    const clamped = Math.max(0, Math.min(this.transport.value.currentTrackIndex, this._chains.length - 1));
    this.transport.update((d) => {
      d.currentTrackIndex = clamped;
    });
    this.activeEqIndex.value = clamped;
  }

  play(): void {
    const chain = this._chains[this.transport.value.currentTrackIndex];
    if (!chain) return;
    if (!chain.asset) {
      chain.pendingPlay = true;
      this._loadAsset(chain);
      return;
    }
    chain.slot.play();
  }

  pause(): void {
    this._chains[this.transport.value.currentTrackIndex]?.slot.pause();
  }

  resume(): void {
    this._chains[this.transport.value.currentTrackIndex]?.slot.resume();
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
    if (this._chains.length === 0) {
      this.transport.update((d) => {
        d.currentTrackIndex = i;
      });
      return;
    }
    const idx = ((i % this._chains.length) + this._chains.length) % this._chains.length;
    const prev = this._chains[this.transport.value.currentTrackIndex];
    const next = this._chains[idx]!;
    const wasPlaying = this.transport.value.isPlaying;

    if (prev && prev !== next) {
      prev.slot.stop();
    }

    this.transport.update((d) => {
      d.currentTrackIndex = idx;
      d.currentTime = 0;
      d.duration = NaN;
    });
    this.activeEqIndex.value = idx;

    if (wasPlaying) {
      next.pendingPlay = true;
    }
    if (!next.asset) {
      this._loadAsset(next);
    } else if (next.pendingPlay) {
      next.pendingPlay = false;
      next.slot.play();
    }
  }

  next(): void {
    this.loadTrack(this.transport.value.currentTrackIndex + 1);
  }

  prev(): void {
    this.loadTrack(this.transport.value.currentTrackIndex - 1);
  }

  /** Read-only view of all chains. Exposed for DevTools / tests. */
  get chains(): readonly { track: Track; eq: EQ3 }[] {
    return this._chains.map((c) => ({ track: c.track, eq: c.eq }));
  }

  private _wireSlot(chain: TrackChain): void {
    const { slot } = chain;
    slot.on("play", (instance: pc.SoundInstance) => {
      this._activeInstance = instance;
      this.transport.update((d) => {
        d.isPlaying = true;
        const dur = instance.duration;
        if (Number.isFinite(dur) && dur > 0) d.duration = dur;
      });
    });
    slot.on("pause", () => {
      this.transport.update((d) => {
        d.isPlaying = false;
      });
    });
    slot.on("resume", () => {
      this.transport.update((d) => {
        d.isPlaying = true;
      });
    });
    slot.on("stop", () => {
      this._activeInstance = null;
      this.transport.update((d) => {
        d.isPlaying = false;
      });
    });
    slot.on("end", () => {
      this._activeInstance = null;
      this.transport.update((d) => {
        d.isPlaying = false;
      });
      this.next();
    });
  }

  private _destroyChain(index: number): void {
    const chain = this._chains[index];
    if (!chain) return;
    chain.slot.stop();
    this._component?.removeSlot(chain.slot.name);
    chain.eq.destroy();
    if (chain.asset && this._app) {
      chain.asset.unload();
      this._app.assets.remove(chain.asset);
    }
    this._chains.splice(index, 1);
    if (this._activeInstance && !this._chains.some((c) => c.slot.isPlaying)) {
      this._activeInstance = null;
    }
  }

  private _loadAsset(chain: TrackChain): void {
    if (!this._app || chain.asset) return;
    const asset = new pc.Asset(chain.track.title || chain.slot.name, "audio", { url: chain.track.src });
    chain.asset = asset;
    this._app.assets.add(asset);
    asset.ready(() => {
      if (!this._component) return;
      chain.slot.asset = asset.id;
      const sound = asset.resource as pc.Sound | undefined;
      if (sound && Number.isFinite(sound.duration) && this._chains[this.transport.value.currentTrackIndex] === chain) {
        this.transport.update((d) => {
          d.duration = sound.duration;
        });
      }
      if (chain.pendingPlay) {
        chain.pendingPlay = false;
        chain.slot.play();
      }
    });
    this._app.assets.load(asset);
  }
}
