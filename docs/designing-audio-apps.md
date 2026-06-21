# Designing Audio Apps

How to design a _whole_ audio application with audiorective — multiple sources, multiple UIs, spatial audio — not just wire up one processor. Read this before building anything bigger than a single synth or player. It builds on the audio/UI rule in `architecture.md`.

The running example throughout is the **Livehouse PA Simulator** (`apps/showroom`): you're the PA tech in a cyber venue; each mixer channel is a drone emitting one stem, flown in 3D; a React iPad HUD mixes EQ/volume/solo/pan; a headphone toggle monitors dry. It uses three renderers (PlayCanvas world, React HUD, three.js control widgets) over one engine.

## The shape of the process

1. Design collaboratively; make the metaphor honest.
2. Map every feature to a primitive.
3. Decide state ownership up front.
4. Build the headless audio core first.
5. Choose the right source per role.
6. Integrate renderers via the binding packages.

Each is expanded below, then a special note on spatial routing, common pitfalls, and a checklist.

## 1. Design first; make the metaphor honest

Pin down the UX and features before code, and interrogate the metaphor until the audio model is _truthful_. When the UI metaphor and the audio reality disagree, **change the metaphor, not the audio.**

Worked example: the first idea was a literal mixing console. But a real console sums to stereo, so a "3D pan" control there is fake — the audio can't honor it. Switching the metaphor to **audio drones** flying in the room made 3D spatialization _literally_ true: moving a drone genuinely changes what you hear. The dishonest control became the centerpiece feature.

## 2. Map every feature to a primitive

Turn the feature list into a coverage table — gaps and over-reach surface immediately.

| Feature                               | Primitive                                           |
| ------------------------------------- | --------------------------------------------------- |
| Band stems (drums, bass, synths, vox) | `StreamPlayer` (one per channel)                    |
| FX one-shots (pads)                   | `SoundPlayer` / `Voice` (polyphonic)                |
| Per-instrument 3D position            | `Spatial` (one per channel)                         |
| EQ, volume                            | `Param` / `SchedulableParam`                        |
| Selection, drone position, HUD open   | `Cell` (shared view state)                          |
| Level meters                          | `AnalyserNode` tap                                  |
| Engine assembly, solo/mute, metering  | `createEngine`, `effect`, `computed`                |
| React HUD                             | `@audiorective/react`                               |
| 3D world + per-drone panner           | `@audiorective/playcanvas` (`attach`, `bindPanner`) |

## 3. Decide state ownership up front

The engine owns **all audio state** _and_ **any view state shared across renderers** — as `Cell`/`Param`. UIs only observe and mutate. With multiple renderers, the engine is the single meeting point: no back-channels, no duplicated state.

In the example, `selectedChannelId`, each `channel.position`, and `ui.hudOpen` are engine `Cell`s. React reads them with `useValue` and writes `.value`; the PlayCanvas and three.js scenes read them with alien-signals `effect` and write the same setters. The React component for an imperative view collapses to a DOM host that constructs the scene and disposes it — no props, no ref mirrors, no callbacks crossing the boundary. (See `architecture.md`'s UI/UI section for the wrong-vs-right pattern.)

## 4. Build the headless audio core first

Implement and unit-test the entire audio graph — channels, buses, routing, scheduling, metering — with **no DOM and no renderer**. Litmus: _it runs in a browser-mode unit test_. Only then layer renderers and UI on top.

In the example this was a hard phase split: the audio core (source-agnostic `Channel`, the `Mixer` with its buses, the source types, solo/mute, metering) shipped and was fully tested before any PlayCanvas or React code existed. The renderers then just observed and mutated the already-correct engine.

## 5. Choose the right source per role

- `StreamPlayer` — long-form / streamed parts (stems, backing tracks).
- `SoundPlayer` / `Voice` — one-shots and short loops (pads, SFX, hits).
- An `AudioProcessor` synth — generated parts.

Unify them behind a **source-agnostic channel strip**: a `Channel` that accepts anything exposing `{ output }`, so EQ / fader / meter / spatial / routing are identical regardless of source. Note the tradeoff: `StreamPlayer` runs on the media clock, so it won't sample-lock to ctx-clocked sources — fine for independent stems, not for tight multi-source sync.

## 6. Integrate renderers via the binding packages

One `AudioContext` for everything. `attach(engine, app)` shares it (and arms autostart). `bindPanner` (PlayCanvas) / `PannerAnchor` (three.js) drive a `Spatial`'s panner from a scene transform. Keep **control-only views audio-free**: the three.js EQ/pan widgets create no audio nodes and no `THREE.AudioListener` (which would hijack the shared context) — they read/write engine cells and nothing more.

## ★ Special note — route signals by what distance should do to them

In a spatial app, split every signal by its relationship to listener distance, and make that split a **graph-topology decision**, not an afterthought:

- **Direct/dry** sound goes _through_ the panner → it attenuates with distance.
- **Space-modeling sends** (reverb, room delay/echo) are fed **pre-panner**, so their level is **distance-independent** — they model a diffuse field that doesn't care where the listener stands.
- The **wet/dry ratio then becomes the distance cue**: near = mostly dry, far = relatively wetter.

Worked example bug: reverb was first fed from the _post-panner_ (distance-attenuated) signal, so the wet tracked the dry and the wet/dry ratio never changed — it just got louder up close. The fix was a per-`Channel` pre-panner `auxOut` into a dedicated `Mixer` aux bus → convolver → wet, with the dry room bus left distance-attenuated. _Aux/send effects that represent a space belong before distance attenuation; only the dry path attenuates._

## Common pitfalls

- **Headless audio tests need a path to `ctx.destination`.** An `AudioParam` ramp won't advance `.value` unless its node subgraph is connected to the destination (the browser won't render a dead branch). Connect to `ctx.destination` in the test, mirroring real usage.
- **Loudness-match parallel monitor paths.** When a toggle swaps buses (e.g. room ↔ headphone), trim/boost each so switching doesn't jump in level.
- **Don't duplicate state to "make the UI simpler."** A ref mirror or a callback across the React↔scene boundary is the start of a lifecycle bug. Put it on the engine.

## Checklist

- [ ] Metaphor is honest — the audio can actually do what the UI implies.
- [ ] Every feature maps to a primitive (coverage table).
- [ ] All audio + cross-renderer view state lives on the engine (`Cell`/`Param`); UIs only observe/mutate.
- [ ] The audio core runs and is unit-tested with no DOM/renderer.
- [ ] Each source type fits its role behind a source-agnostic channel.
- [ ] One `AudioContext`; renderers integrated via `attach` / `bindPanner` / `PannerAnchor`; control-only views are audio-free.
- [ ] Spatial sends (reverb) are pre-panner; only the dry path attenuates with distance.

## See also

`core.md` (primitives) · `architecture.md` (audio/UI + UI/UI separation) · `react.md` · `playcanvas.md` · `threejs.md`.
