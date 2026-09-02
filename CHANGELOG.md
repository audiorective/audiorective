# Changelog

All notable, agent-relevant changes to the `@audiorective/*` packages.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
All packages are released together under one version (`bumpp -r --all`), so a
single version number covers the whole toolkit. Each entry names the package(s)
it affects so a reader can tell which dependency to upgrade.

This file exists so an agent (or human) hitting an "API not found / undefined /
type error" on a documented API can tell whether the installed package simply
predates that API. See the "Version mismatches" note in the skill.

## [Unreleased]

### Added

- **core:** `defineGraph` — a declarative, reactive audio graph helper. Edges
  reference nodes and processors directly (`[from, to]`, an options bag for
  multi-channel connections and a debug `label`, or a falsy entry to skip),
  diff against the previous render on every re-run, and connect through a
  processor's `input`/`output`. Available as `this.defineGraph(fn, opts?)`
  (protected, after `super()`) and as the standalone `defineGraph(fn, {
context, compensate? })` for a graph owned by no processor. A bare
  `AudioWorkletNode` is rejected as an edge endpoint — wrap it in an
  `AudioProcessor` that declares its latency.
- **core:** `AudioProcessor.latency: Param<number>` — every processor's
  processing latency in samples, defaulting to `0`. Declared as a fixed
  number, a `Param<number>` (for a latency that changes at runtime), or a
  time-based sample count (`Math.round(0.01 * ctx.sampleRate)`); derived
  automatically from a processor's own `defineGraph` when left undeclared.
  Plugin delay compensation runs on every `defineGraph` re-solve, splicing a
  `DelayNode` into any branch that arrives at a join early so every incoming
  edge lands in step.
- **core:** engine latency queries — `AudioEngine.latency: Param<number>`
  (longest path into `ctx.destination` across every engine-owned graph),
  `AudioEngine.perceivedTime` (`ctx.currentTime` adjusted for latency and
  `ctx.outputLatency`), and `AudioEngine.getPathLatency(proc)` (samples from
  a processor's output to the destination). `createEngine`'s setup callback
  gains a second `{ defineGraph }` argument for wiring the root graph; the
  existing one-argument form still works.
- **core:** `LatencyUnknownError` — thrown by `getPathLatency(proc)` when
  `proc` has never appeared in a `defineGraph`, naming the processor instead
  of silently returning `0`.
- **core:** `GraphHandle.snapshot()` and `GraphHandle.idOf(endpoint)` — a
  point-in-time view of a graph's last solve (`GraphSnapshot`: `solveId`,
  `nodes` with `kind`/`label`/`latency`/`arrival`, `edges` with
  `kind`/`compensationSamples`) and the stable id `snapshot()` assigns an
  endpoint, for building diagrams or devtools off the solver's own state.
  `GraphOptions.onSolve` is now documented as a public hook, called with the
  handle after every solve.
- **devtools:** new package, `@audiorective/devtools` — dev-only impulse
  latency validator for `@audiorective/core` processors. `measureLatency`
  renders a single-sample impulse through a processor offline at each
  configured sample rate and reports where it arrives; `assertLatency` checks
  that against the processor's declared `latency` and throws a message that
  carries the `latency: ...` line to paste when it doesn't match.

### Changed

- **core:** `AudioProcessor.context` widens from `AudioContext` to
  `BaseAudioContext`, so processors can be constructed against an
  `OfflineAudioContext` for offline measurement. Existing code that passes
  `proc.context` where an `AudioContext` is expected needs its own
  `AudioContext` reference, or a cast, at that call site.

### Fixed

- **core:** an engine-owned graph that stops reaching `ctx.destination` (an
  edge condition turns false, the graph is disposed) drops its contribution
  to `engine.core.latency` instead of leaving the last value it solved.
- **core:** `getPathLatency` now always throws `LatencyUnknownError` for a
  processor that isn't part of the current solve — one dropped from the edge
  list, one whose owning graph was disposed, or one that only feeds an
  `AudioParam` — instead of leaking `defineGraph`'s internal "not present in
  the last solve" error for the first two cases.
- **devtools:** `measureLatency` destroys each per-sample-rate processor it
  builds after rendering, instead of leaking one `OfflineAudioContext`-scoped
  processor per configured rate.

## [2.1.2] - 2026-08-24

### Added

- **core:** `EngineEnvironmentError` — thrown by the `AudioEngine` constructor
  (and therefore by `createEngine`) when the environment has no `AudioContext`
  constructor, instead of a bare `ReferenceError: AudioContext is not defined`.
  The message names the fix for the environment it landed in: on a server or
  build-time render it points at the client-only boundary
  (`next/dynamic` with `ssr: false`, Astro `client:only`); in a DOM without Web
  Audio (jsdom) it points at passing a context. Supplying one —
  `createEngine(setup, { context })` or `new AudioEngine(ctx)` — never triggers
  it, and the check runs before `setup`, so a failed call leaves no half-built
  graph.

### Changed

- **docs, skill:** audiorective is documented as officially client-only. New
  guide "Server-rendered frameworks" (`docs/client-boundary.md`) covers the
  boundary pattern for Next.js/Remix/Astro, why `'use client'` is not a
  boundary, how to choose the seam, and troubleshooting. The agent skill gained
  a matching top-level rule.

## [2.1.1] - 2026-08-15

### Fixed

- **clock, react, threejs, playcanvas:** these packages declared an exact
  version of `@audiorective/core` (`"2.1.0"` rather than `"^2.1.0"`), so a
  project on a newer core got a second copy of it nested under the binding
  package instead of sharing one. Two copies break `instanceof AudioProcessor`
  inside `AudioEngine` for processors built from the other copy, and give a
  single `AudioContext` two `ParamSync` loops. Upgrading any one binding
  package to 2.1.1 is enough to deduplicate it.

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
