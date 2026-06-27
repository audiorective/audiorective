# Designing Audio Apps

How to design a _whole_ audio application with audiorective — multiple sources, multiple UIs, spatial audio — not just wire up one processor. Builds on the audio/UI rule in `architecture.md`.

## Principles

### 1. Own state on the engine

The engine owns **all audio state** _and_ **any view state shared across renderers** — as `Cell`/`Param`. UIs only observe and mutate; they never hold the source of truth. With multiple renderers the engine is the single meeting point, so there are no back-channels and no duplicated state.

- React reads with `useValue`, writes with `.value` / `.update`.
- Imperative views (three.js, PlayCanvas, Canvas2D) read with alien-signals `effect`, write with the same setters.
- A React component wrapping an imperative view collapses to a DOM host that constructs/disposes the scene — no props, no ref mirrors, no callbacks crossing the boundary.

See `architecture.md`'s UI/UI section for the wrong-vs-right pattern.

### 2. Build the headless audio core first

Implement and unit-test the entire audio graph — channels, buses, routing, scheduling, metering — with **no DOM and no renderer**. Litmus: _it runs in a browser-mode unit test_. Only then layer renderers and UI on top, as thin observers of an already-correct engine.

### 3. Map features to primitives; pick the source per role

Turn the feature list into a feature→primitive table before coding — gaps and over-reach surface immediately. Match each source to its role:

- `FilePlayer` — long-form / streamed parts (music, backing tracks, podcasts).
- `BufferPlayer` — beat-locked loops & stems that need sample-accurate `start()` and a schedulable rate (in-memory deck).
- `Sampler` / `Voice` — one-shots and short loops (SFX, hits, pads).
- An `AudioProcessor` synth — generated parts.

Unify them behind a **source-agnostic channel strip** — a `Channel` that accepts anything exposing `{ output }` — so EQ / fader / meter / spatial / routing are identical regardless of source. Tradeoff on the clock: `FilePlayer` runs on the media clock, so it won't sample-lock to ctx-clocked sources (fine for independent stems, not for tight multi-source sync); reach for `BufferPlayer` when several sources must stay phase-locked. See `choosing-playback.md` for the full decision.

### 4. Integrate renderers via the binding packages

One `AudioContext` for everything. `attach(engine, app)` shares it (and arms autostart). `bindPanner` (PlayCanvas) / `PannerAnchor` (three.js) drive a `Spatial`'s panner from a scene transform. Keep **control-only views audio-free**: a widget that only edits parameters (an EQ curve, a pan pad) creates no audio nodes and no `THREE.AudioListener` (which would hijack the shared context) — it reads/writes engine cells and nothing more.

### 5. Route spatial sends by distance (pre-panner)

In a spatial app, split every signal by its relationship to listener distance, and make that split a **graph-topology decision**:

- **Direct/dry** sound goes _through_ the panner → it attenuates with distance.
- **Space-modeling sends** (reverb, room delay) are fed **pre-panner**, so their level is distance-independent — they model a diffuse field that doesn't care where the listener stands.
- The **wet/dry ratio becomes the distance cue**: near = mostly dry, far = relatively wetter.

A reverb fed _post-panner_ tracks the dry and never opens up as you move — a subtle, common bug. Send effects that represent a space belong before distance attenuation; only the dry path attenuates.

## Common pitfalls

- **Headless audio tests need a path to `ctx.destination`.** An `AudioParam` ramp won't advance `.value` unless its node subgraph reaches the destination (the browser won't render a dead branch). Connect to `ctx.destination` in the test, mirroring real usage.
- **Loudness-match parallel monitor paths.** When a toggle swaps buses (e.g. room ↔ headphone), trim/boost each so switching doesn't jump in level.
- **Don't duplicate state to "simplify the UI."** A ref mirror or a callback across the UI↔scene boundary is the start of a lifecycle bug. Put it on the engine.

## Checklist

- [ ] All audio + cross-renderer view state lives on the engine (`Cell`/`Param`); UIs only observe/mutate.
- [ ] The audio core runs and is unit-tested with no DOM/renderer.
- [ ] Every feature maps to a primitive; each source fits its role behind a source-agnostic channel.
- [ ] One `AudioContext`; renderers integrated via `attach` / `bindPanner` / `PannerAnchor`; control-only views are audio-free.
- [ ] Spatial sends (reverb) are pre-panner; only the dry path attenuates with distance.

## Worked example: Livehouse PA Simulator

`apps/showroom` — you're the PA tech in a cyber venue; each mixer channel is a drone emitting one instrument, flown in 3D; a React iPad HUD mixes EQ/volume/solo/pan; a headphone toggle monitors dry. Three renderers (PlayCanvas world, React HUD, three.js control widgets) over one engine.

How the principles show up: drone positions, selection, and HUD state are engine `Cell`s observed by all three renderers (P1). The whole engine — `Channel`, `Mixer`, sources, routing, metering — was built and tested headless before any renderer (P2). Five stems use `FilePlayer`, the FX pads use `Sampler`, all behind one source-agnostic `Channel` (P3). `attach` + `bindPanner` wire PlayCanvas to the panners; the three.js EQ/pan widgets are control-only (P4). Reverb is a per-channel pre-panner aux send into a shared convolver, so it stays distance-independent (P5).

## See also

`core.md` (primitives) · `architecture.md` (audio/UI + UI/UI separation) · `react.md` · `playcanvas.md` · `threejs.md`.
