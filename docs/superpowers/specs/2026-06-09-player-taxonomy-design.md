# Player taxonomy: SoundPlayer (pad) + StreamPlayer (track) — design spec

Date: 2026-06-09
Package: `@audiorective/core` (+ `apps/showroom` shared audio)
Builds on: `docs/superpowers/specs/2026-06-05-sound-player-design.md`

## Context & motivation

`SoundPlayer` (PR #12, not yet merged) currently wears two hats: a polyphonic
buffer source (`trigger()`) **and** a song-style transport (`play`/`pause`/
`seek`/`stop` over a "current voice"). The transport hat only existed because
there was no streaming primitive — and it caused real confusion (`play()` no-ops
while playing, which looks wrong next to polyphony until you realize `trigger()`
is the polyphonic door).

Now that we're adding a streaming player, the roles separate cleanly:

- **`SoundPlayer` = drum pads.** You _hit_ it. `trigger()` fires a voice; mashing
  it overlaps voices (polyphony). No playhead, no transport. Buffer-backed,
  sample-accurate, gapless loops. For SFX / one-shots / stingers.
- **`StreamPlayer` = a track.** You _operate_ it. `play`/`pause`/`seek`/`stop`
  over a single moving playhead with progress. `MediaElement`-backed (streams,
  no full decode). For music / long-form / scrubbing.

This spec covers three coordinated changes shipped as **one PR** on the existing
`claude/core-sound-player` branch:

1. **Slim `SoundPlayer`** to the pure pad role (drop player-level transport).
2. **Add `StreamPlayer`** (the track).
3. **Refactor the shared `MusicPlayer`** to wrap `StreamPlayer` (keep its EQ +
   playlist + public API; both demos use `StreamPlayer` transitively).

### The resulting taxonomy

|          | `SoundPlayer` (pad)       | `StreamPlayer` (track)            |
| -------- | ------------------------- | --------------------------------- |
| Source   | `AudioBuffer`             | stream (`HTMLAudioElement`)       |
| Voices   | many (polyphonic)         | one (single playhead)             |
| API      | `trigger()` → `Voice`     | `play`/`pause`/`seek`/`stop`      |
| Progress | per-`Voice` `currentTime` | reactive `currentTime`/`duration` |
| Best for | SFX, one-shots, loops     | music, long-form, scrubbing       |

Spatial/EQ compose externally on both via `player.output → … → spatial.input`.

## Non-goals (deferred)

- A buffered-transport primitive (a "sample with a play/pause button + reactive
  progress"). The rare case is still reachable via a `Voice` handle; a dedicated
  `Sampler` is future work.
- Playlist in core (stays app-level, as in `MusicPlayer`).
- Per-voice positioning, named collections — unchanged from the SoundPlayer spec.

---

## 1. Slim `SoundPlayer`

`Voice` is **unchanged** — it keeps full per-voice `stop`/`pause`/`resume`/`seek`/
`currentTime`/`onEnded` (that's the escape hatch for the rare buffered-scrub case).

`SoundPlayer` changes:

**Remove**

- `play()`, `pause()`, `resume()`, `seek()`, `stop()` (player-level transport).
- `get currentTime()`, `get duration()`.
- `cells.isPlaying` and all `_current` bookkeeping.

**Keep**

- `trigger(opts?) → Voice | null`, `stopAll(when?)`.
- `buffer`, `get output()`, `volume` param, polyphony/`steal`, `destroy()`.
- `cells.activeVoices: Cell<number>`.

Resulting type: `SoundPlayer extends AudioProcessor<{ volume: SchedulableParam }, { activeVoices: Cell<number> }>`.

`trigger()` no longer sets `_current`/`isPlaying`; `_evict()` only splices the
voice out and updates `activeVoices`. `stopAll()` just stops all voices (cells
follow via `_evict`). The original SoundPlayer spec's "transport" section and the
behavior that `play()` is a no-op while playing are removed.

---

## 2. `StreamPlayer` (core)

`packages/core/src/StreamPlayer.ts` — an `AudioProcessor` (output-only) wrapping
`HTMLAudioElement → MediaElementAudioSourceNode → outputGain`. Single playhead;
native transport (no recreate-at-offset).

```ts
interface StreamPlayerOptions {
  src?: string; // settable later via .src
  loop?: boolean; // default false (sets audio.loop)
  volume?: number; // output gain 0..1, default 1
  playbackRate?: number; // default 1
  crossOrigin?: string | null; // default "anonymous" (MediaElementSource on remote URLs)
  preload?: "none" | "metadata" | "auto"; // default "metadata"
}

class StreamPlayer extends AudioProcessor<
  { volume: SchedulableParam },
  { isPlaying: Cell<boolean>; currentTime: Cell<number>; duration: Cell<number> }
> {
  constructor(ctx: AudioContext, opts?: StreamPlayerOptions);

  get output(): AudioNode; // outputGain
  get src(): string | null;
  set src(url: string | null); // assigns audio.src + load(); resets currentTime=0, duration=NaN
  set loop(v: boolean); // audio.loop
  set playbackRate(v: number); // audio.playbackRate

  play(): Promise<void>; // audio.play(); also resumes from currentTime; swallows the autoplay-gesture rejection
  pause(): void; // audio.pause()
  seek(t: number): void; // clamp to [0, duration], set audio.currentTime
  stop(): void; // pause + rewind to 0
  onEnded(cb: () => void): void; // fires on natural end (not pause/stop); for playlist advance etc.

  override destroy(): void; // pause, remove listeners, disconnect, release src
}
```

### Reactive state — cells, not getters (deliberate divergence from `Voice`)

`StreamPlayer` exposes `currentTime`/`duration` as **reactive `Cell`s**, unlike
`Voice` (getter). Justification: a `MediaElement` emits native progress events,
so the cells are free and event-driven, and a "track" UI wants reactive
time/progress. The slim removes `currentTime` from `SoundPlayer` entirely, so
there's no pad-vs-track inconsistency to reconcile.

- `cells.isPlaying` ← `play` / `pause` / `ended` events.
- `cells.currentTime` ← `timeupdate` / `seeking` (and reset to 0 on `src` change / `stop`).
- `cells.duration` ← `loadedmetadata` (NaN until known).

### Mechanics

- Graph built once in the constructor: `createMediaElementSource(audio) → outputGain`; `volume` bound to `outputGain.gain`.
- `audio.crossOrigin` set before `src` so `MediaElementSource` works on remote URLs without tainting.
- `loop=true` sets `audio.loop` (native gapless-ish loop; `ended` won't fire while looping).
- `play()` returns the element's play promise and swallows the pending-gesture rejection (mirrors the current `MusicPlayer.play()`), so a pre-gesture call is harmless and the UI can retrigger.
- `MediaElementAudioSourceNode` can't be recreated for an element; the player owns one element for its lifetime. `destroy()` pauses, removes listeners, disconnects nodes, and clears `src`.

---

## 3. `MusicPlayer` wraps `StreamPlayer`

`apps/showroom/src/shared/audio/MusicPlayer.ts` keeps its **public API unchanged**
(`cells.transport` `{ isPlaying, currentTime, duration, currentTrackIndex }`,
`cells.tracks`, `play`/`pause`/`seek`/`loadTrack`/`next`/`prev`, `eq`, `output`),
so the demos and `PlayerPopup` need no changes. Internally:

- Constructs a `StreamPlayer` + `EQ3` + the playlist (`tracks`, `currentTrackIndex`).
- Graph: `streamPlayer.output → eq.input`; `MusicPlayer.output = eq.output`.
- `loadTrack(i)` sets `streamPlayer.src = tracks[i].src` and updates `currentTrackIndex`; `next`/`prev` wrap around (current behavior).
- `play`/`pause`/`seek` delegate to the `StreamPlayer`.
- `cells.transport` is mirrored from the StreamPlayer cells via an `effect` (merging `isPlaying`/`currentTime`/`duration` with the playlist's `currentTrackIndex`); `MusicPlayer` registers `streamPlayer.onEnded(() => this.next())` to preserve auto-advance.

The streaming/`HTMLAudioElement` ownership moves from `MusicPlayer` into
`StreamPlayer`; `MusicPlayer` becomes composition (playlist + EQ + transport
mirror). It no longer creates audio nodes directly.

---

## Testing

All in vitest browser/chromium (core runs serially via `fileParallelism: false`).

**SoundPlayer slim:** existing `trigger & polyphony` tests stay green; delete the
`transport` describe block; update the `stopAll(when)` test to assert only
`activeVoices` (no `isPlaying`). Confirm no `isPlaying`/`currentTime`/`play` on
`SoundPlayer` (a small "API surface" assertion).

**StreamPlayer:** feed a tiny inline **WAV data URI** (generated in-test: 44-byte
header + silence) to a real `HTMLAudioElement`. Verify:

- `output` is an `AudioNode`; `volume` param drives `outputGain.gain`.
- `play()` → `cells.isPlaying` true (after `play` event); `pause()` → false.
- `loadedmetadata` populates `cells.duration`; `seek(t)` sets `cells.currentTime` and clamps.
- `loop` sets `audio.loop`.
- `stop()` → paused + `currentTime` 0.
- `onEnded` fires once when a (non-looping) clip plays to its end.
- `destroy()` disconnects and doesn't throw.
  Event-driven assertions use short awaits; serialized execution keeps timing stable.

**MusicPlayer:** a smoke test that the wrapper still exposes `cells.transport`/
`cells.tracks`/`eq`/`output` and that `loadTrack`/`play` drive the underlying
`StreamPlayer` (assert `transport.currentTrackIndex` updates and `output` is a node).

## Verification (end to end)

- `pnpm --filter @audiorective/core test -- --run` — all core tests green (slimmed SoundPlayer + new StreamPlayer).
- `pnpm --filter @audiorective/showroom run typecheck` + the showroom build — `MusicPlayer` wrapper compiles; `PlayerPopup`/demos unchanged.
- `pnpm -r run build` — workspace builds.
- Manual (ask user to start dev server): both spatial rooms still play music via the wrapped `MusicPlayer` (now StreamPlayer under the hood); play/pause/seek/next/prev and EQ behave as before.

## Future work

- `Sampler` / buffered-transport primitive if "buffer with a transport UI" demand appears.
- `SoundPlayer` exports/`Voice` unchanged; `StreamPlayer` joins the core index exports.
