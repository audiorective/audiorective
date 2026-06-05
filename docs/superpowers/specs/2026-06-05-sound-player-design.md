# SoundPlayer — design spec

Date: 2026-06-05
Package: `@audiorective/core`

## Context & motivation

audiorective today has `AudioProcessor`, `Spatial`, the engine, and reactive
primitives — but **no sample-playback primitive**. The showroom `MusicPlayer` is
an example-level class built on a single streaming `HTMLAudioElement`; it can't
trigger short samples, can't overlap voices, and isn't a reusable core building
block.

This is the gap that stops audiorective from covering game-audio use cases (and
from being a credible Tone.js alternative). When we recently re-architected the
PlayCanvas binding to the anchor model (audiorective owns the audio graph, the
renderer only binds a transform), it became clear that a user wanting the
abilities PlayCanvas's `SoundComponent`/`SoundSlot` provide — a source with
named triggers, looping, polyphonic overlap, per-voice control — has nothing in
core to reach for.

`SoundPlayer` fills that gap: a buffer-backed, polyphonic, transport-capable
source primitive. It maps cleanly onto what `SoundComponent`/`SoundSlot` do, and
is the foundational layer for later `Players` collections and a `Sampler`.

### What it replaces from PlayCanvas

| PlayCanvas          | What it is                                                                        | audiorective                                                      |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `SoundInstance(3d)` | one live voice (`BufferSource → gain`, transport, `onended`)                      | a **`Voice`** (3D = compose with `Spatial`)                       |
| `SoundSlot`         | named reloadable config that spawns instances; `overlap`, loop, default vol/pitch | a **`SoundPlayer`**                                               |
| `SoundComponent`    | map of slots + spatial config on an entity                                        | a collection of players + `Spatial` (composition; not a v1 class) |

## Goals (v1 scope)

- A `SoundPlayer` (buffer source) with **voice + polyphony**.
- `trigger()` returns a **`Voice` handle**; player-level controls act on all voices.
- Full per-voice **`pause` / `resume` / `seek`** (via recreate-at-offset — the
  standard Web Audio pattern; `AudioBufferSourceNode` is one-shot by spec).
- Player takes a **decoded `AudioBuffer`**; a **separate loader + cache** helper
  handles fetch/decode.
- **Single shared output** — the player is spatial-agnostic; voices sum into one
  `.output`, composed with `Spatial` externally. One player = one emitter
  (mirrors `SoundComponent`).

## Non-goals (deferred)

- Named-collection layer (`Players` / `SoundBank`).
- Per-voice independent positioning (per-voice panners).
- Pitched multi-sample `Sampler`.
- Streaming / long-form playback (`SoundStreamPlayer` over `MediaElement`) — the
  existing showroom `MusicPlayer` keeps that role for now.

## Architecture

New files in `packages/core/src/`:

- `SoundPlayer.ts` — `AudioProcessor` subclass, output-only (a source/instrument).
- `Voice.ts` — per-trigger handle; owns one `BufferSource → voiceGain`. Plain
  class (transient, not user-composed).
- `loadAudioBuffer.ts` — `loadAudioBuffer(ctx, url)` + `AudioBufferCache`.

Exports added to `packages/core/src/index.ts`:
`SoundPlayer`, `Voice`, `loadAudioBuffer`, `AudioBufferCache`, plus option/type
exports (`SoundPlayerOptions`, `TriggerOptions`).

## API

### `SoundPlayer`

```ts
interface SoundPlayerOptions {
  buffer?: AudioBuffer; // settable later via .buffer
  loop?: boolean; // default for new voices
  playbackRate?: number; // default for new voices
  volume?: number; // player output gain (0..1), default 1
  polyphony?: number; // max concurrent voices, default 1
  steal?: "oldest" | "none"; // at cap: stop oldest then spawn, or drop. default "oldest"
}

interface TriggerOptions {
  offset?: number; // buffer start offset (s), default 0
  duration?: number; // play length (s), default to end of buffer
  when?: number; // ctx-time to start, default now
  rate?: number; // overrides player playbackRate
  volume?: number; // per-voice gain, default 1
  loop?: boolean; // overrides player loop
}

class SoundPlayer extends AudioProcessor<{ volume: SchedulableParam }, { activeVoices: Cell<number> }> {
  constructor(ctx: AudioContext, opts?: SoundPlayerOptions);

  buffer: AudioBuffer | null; // hot-swappable; affects future triggers only
  get output(): AudioNode; // summing gain

  trigger(opts?: TriggerOptions): Voice | null; // null if no buffer or dropped by steal:"none"
  stopAll(when?: number): void;

  override destroy(): void; // stopAll + disconnect output; does NOT free the shared buffer
}
```

Construction sketch (matches `AudioProcessor` build API):

```ts
constructor(ctx, opts = {}) {
  const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
  super(ctx, ({ param, cell }) => ({
    params: { volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }) },
    cells: { activeVoices: cell(0) },
  }));
  this._output = outputGain;
  // store buffer/loop/rate/polyphony/steal
}
get output() { return this._output; }
```

`volume` binds to the output gain's `AudioParam`, so it's a rampable
`SchedulableParam` like every other audiorective param.

Behavior matrix (covers all `SoundSlot` modes from two knobs):

| `polyphony` | `steal`    | retrigger behavior          | PlayCanvas equivalent      |
| ----------- | ---------- | --------------------------- | -------------------------- |
| 1           | `"oldest"` | restart from start          | `overlap = false`          |
| 1           | `"none"`   | ignore while playing        | (no built-in equiv)        |
| N           | `"oldest"` | overlap; drop oldest past N | `overlap = true` (bounded) |

### `Voice`

```ts
class Voice {
  stop(when?: number): void;
  pause(): void; // capture offset, stop source
  resume(): void; // recreate source from saved offset
  seek(t: number): void; // jump to t (recreate if playing, else store)
  get currentTime(): number; // computed from ctx time + offset (loop-aware)
  get duration(): number;
  get isPlaying(): boolean;
  set volume(v: number); // live (voiceGain.gain)
  set rate(v: number); // live (rebases offset baseline — see below)
  onEnded(cb: () => void): void; // natural end OR stop; fires once
}
```

### Loader + cache

```ts
function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer>;
// fetch(url) -> arrayBuffer -> ctx.decodeAudioData

class AudioBufferCache {
  constructor(ctx: AudioContext);
  load(url: string): Promise<AudioBuffer>; // dedupes concurrent loads, caches results
  clear(): void;
}
```

Pure helpers, no `SoundPlayer` coupling. One decoded buffer can feed many players
and voices. Explicit cache class so its lifetime is visible and disposable
(chosen over a hidden module-level Map).

## Mechanics

### Voice offset math (the only subtle part)

`AudioBufferSourceNode` is one-shot by spec: `start()` runs once, there is no
`pause()` and no settable playhead. The only launch control is
`start(when, offset, duration)`. So pause/resume/seek = **recreate a fresh source
at a computed offset** — the same approach Tone.js, Howler, and PlayCanvas use.
Source nodes are cheap (no decode; they just point at the shared buffer).

Each voice tracks: `_startedAt` (ctx time the current source started), `_offset`
(buffer offset it started from), `_rate`, `_paused`, `_stopping`.

- **currentTime** (getter): non-loop → `_offset + (ctx.currentTime - _startedAt) * _rate`, clamped to `duration`; loop → modulo loop length.
- **pause** → `_offset = currentTime`; set `_stopping` (suppress `onended`-as-natural-end); `source.stop()`; `_paused = true`.
- **resume** → create source `start(now, _offset)`; `_startedAt = now`; `_paused = false`.
- **seek(t)** → if playing: suppress-stop + new source at `t`; if paused: `_offset = t`.
- **set rate (while playing)** → rebase so currentTime stays continuous: `_offset = currentTime; _startedAt = now; _rate = v; source.playbackRate.value = v`.
- **live without recreate**: `playbackRate.value`, `loop`/`loopStart`/`loopEnd`, `voiceGain.gain` (volume).
- **natural end** → source `onended` (when not `_stopping`) → fire `onEnded` once, notify player to evict.

### Polyphony / voice pool

`SoundPlayer._voices: Voice[]`. `trigger()`:

1. No `buffer` → `null` (warn).
2. `_voices.length >= polyphony`: `"oldest"` → stop `_voices[0]`; `"none"` → return `null`.
3. Build `Voice` (`BufferSource → voiceGain → output`), `start()`, push, bump `cells.activeVoices`.
4. Voice end/stop → evict from `_voices`, disconnect its nodes, decrement `activeVoices`.

`stopAll(when?)` stops every voice.

## Reactive state

- Player: `params.volume` (`SchedulableParam`), `cells.activeVoices: Cell<number>`.
- `Voice.currentTime` is a **getter, not a Cell** — consumers poll it in their
  frame loop (`app.on("update")` / `requestAnimationFrame`), avoiding per-sample
  reactivity churn. A single-voice music UI can mirror it into a cell itself.

## Composition

`SoundPlayer` is output-only:

- 2D: `player.output → ctx.destination`.
- 3D: `player.output → spatial.input → ctx.destination`, with the renderer
  binding the emitter transform (`bindPanner(app, entity, spatial.panner)` /
  three.js `PannerAnchor`). One player = one emitter, consistent with the
  anchor model and with `SoundComponent`.

`destroy()`: `stopAll()` + disconnect output (+ base `AudioProcessor.destroy`).
The shared `AudioBuffer` is **not** owned and is never freed by the player.

## Relationship to the existing `MusicPlayer`

They coexist. The showroom `MusicPlayer` (MediaElement, streaming, single
playhead) remains for long-form music; `SoundPlayer` is the buffer/SFX/short-
sample primitive. A future `SoundStreamPlayer` may generalize the MediaElement
path; not in v1.

## Testing

vitest browser env with a real `AudioContext` (matching existing core tests):

- `trigger()` increments `activeVoices` and connects a voice to `output`.
- Polyphony cap: `steal:"oldest"` stops the oldest; `steal:"none"` returns `null`.
- `stopAll()` → `activeVoices` returns to 0; voices disconnected.
- `Voice.currentTime` advances ≈ wallclock × rate (with tolerance).
- `pause()` freezes `currentTime`; `resume()` continues from offset; `seek()` jumps.
- `loop`: `currentTime` wraps; source `loop` is set.
- `onEnded` fires exactly once on natural end (tiny buffer) and on programmatic
  stop — never double-fires (the `_stopping` guard).
- `loadAudioBuffer` decodes a known buffer; `AudioBufferCache.load` dedupes
  concurrent loads (single decode) and returns cached buffers.

## Future work

- `Players` / `SoundBank`: named collection sharing one `Spatial` (full
  `SoundComponent` parity).
- Per-voice positioning (`trigger({ position })` with per-voice panners).
- `Sampler` (pitched multi-sample, note-triggered).
- `SoundStreamPlayer` (MediaElement streaming) + refactor `MusicPlayer` onto it.
