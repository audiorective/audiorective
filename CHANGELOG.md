# Changelog

All notable, agent-relevant changes to the `@audiorective/*` packages.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
All packages are released together under one version (`bumpp -r --all`), so a
single version number covers the whole toolkit. Each entry names the package(s)
it affects so a reader can tell which dependency to upgrade.

This file exists so an agent (or human) hitting an "API not found / undefined /
type error" on a documented API can tell whether the installed package simply
predates that API. See the "Version mismatches" note in the skill.

## [2.1.0] - 2026-08-15

### Added

- **clock:** New package `@audiorective/clock` — the timing and scheduling
  engine. `Clock` (worker-based look-ahead tick loop, transport
  start/pause/resume/stop/seek, miss detection via `onMiss`) + `Timeline`
  (beat↔time conversion, anchor, `generation`) + a standalone event-list
  `TempoParam` (V1: steps only; ramp methods throw, reserved for V2) + four
  stateless rulers (`LinearBarRuler`, `CycleBarRuler`, `LinearTimeRuler`,
  `CycleTimeRuler`) with grid iteration, `spans`, and a reactive `current`
  reading for visuals. Looping is expressed as a `CycleBarRuler` reading, not
  transport state — the beat axis never jumps. Linear and cycling rulers yield
  different grid points: linear counts forever (`index`), while a cycle ruler
  folds into its region (`step`, `cycle`) so a pattern's length can be passed
  as the division and `step` indexes it directly. See `docs/clock.md` and
  `docs/superpowers/specs/2026-07-04-clock-design.md`.
- **docs/skill:** `clock.md` — usage guide for the new package; `SKILL.md`
  packages table and read-next table updated accordingly.
- **apps:** `step-sequencer` — a 4-track × 16-step drum machine demoing the
  clock end to end: one `grid(patternLength)` loop over a cycle ruler whose
  region holds exactly one pass of the pattern (so scheduling needs no modulo),
  two rulers stacked on one timeline (`pattern` for scheduling and the
  playhead, `bar` for the absolute position readout), live tempo, transport,
  and live pattern editing, over a headless `DrumMachine` core that is an
  `AudioProcessor` consuming a `Clock`.

### Fixed

- **clock:** `Timeline.addRuler` stored the reading `Param` where the slot
  object belonged, so `timeline.rulers.<key>.current` was `undefined` at
  runtime (an `as unknown as` cast hid it from the type checker). Anything
  binding a UI to a ruler reading would have crashed on mount.
- **clock:** the published `.d.ts` degraded every consumer's ruler readings to
  `unknown` — a method generic named `K` collided with the `[K in keyof
TRulers]` mapped types and the declaration bundler emitted `TRulers[K$1]`.
  Source-level types were always correct, so only a consumer compiling against
  the built package saw it.

## [2.0.0]

### Changed

- **BREAKING — core:** Player taxonomy renamed to split cleanly on source
  (in-memory buffer vs streamed file) and voice model (polyphonic vs single
  playhead). `SoundPlayer` → `Sampler`, `StreamPlayer` → `FilePlayer` (and their
  `SoundPlayerOptions`/`StreamPlayerOptions` types → `SamplerOptions`/
  `FilePlayerOptions`). Update imports accordingly.

### Added

- **core:** `BufferPlayer` (+ `BufferPlayerOptions`) — buffer-backed
  single-playhead deck: sample-accurate `start`/`stop`/`loop` with a schedulable
  `params.rate` for beat-locked loops, stems, and DJ pitch/tempo moves. Its
  source is one-shot, so each `start()` builds a fresh node and re-points the
  stable `params.rate` at it via `SchedulableParam.rebind()`.
- **core:** `SchedulableParam.rebind()` — re-point a stable param at a freshly
  built source node, so a single reactive reference survives node rebuilds while
  scheduled automation always lands on the live source.
- **core:** `Analyser` (+ `AnalyserOptions`) — an `AudioProcessor` wrapping an
  `AnalyserNode` as a pass-through tap. Exposes `readFrequencies`/`readWaveform`
  with `createFrequencyBuffer`/`createWaveformBuffer` and `binCount`/`fftSize`,
  for audio visualizers. Poll it from a render loop, not an `effect()`.
- **docs/skill:** `choosing-playback.md` — decision flow plus per-primitive
  use/avoid and common mistakes for `Sampler`, `BufferPlayer`, and `FilePlayer`.
- **docs/skill:** `pixijs.md` — guide for pairing PixiJS with audiorective. No
  binding package is needed; core + `alien-signals` cover it. Documents the boot
  one-liner, the `effect`-vs-`ticker` decision, and the worked example
  `apps/pixi-visualizer`.

### Fixed

- **core:** `BufferPlayer.loop` setter now reapplies the loop window when toggled
  mid-play.

## [1.2.0]

### Added

- **core:** `SoundPlayer` — buffer-backed, polyphonic pad. `trigger()` returns a
  `Voice` for SFX and one-shots.
- **core:** `StreamPlayer` — streaming track with a single play/pause/seek
  transport, for music and long-form audio.
- **core:** `Voice` (+ `VoiceOptions`) — per-trigger handle spawned by
  `SoundPlayer`.
- **core:** `loadAudioBuffer` + `AudioBufferCache` — fetch/decode helper with an
  explicit-lifetime buffer cache.
- **core:** `AudioProcessor.input` convention for effect-style processors.
- **playcanvas:** new package `@audiorective/playcanvas` — PlayCanvas scene
  bindings (`attach`, `bindPanner`).

### Changed

- **core:** `SoundPlayer` slimmed to a polyphonic pad — the song-style player
  transport (`play`/`pause`/`resume`/`seek`) moved to the new `StreamPlayer`.
  Code that drove a track through `SoundPlayer`'s transport must move to
  `StreamPlayer`.

## [1.1.2]

Baseline for this changelog. Earlier history lives in the git log.
