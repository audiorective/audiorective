---
name: audiorective
description: >
  Use when building web audio applications — synthesizers, sequencers, DAWs,
  audio visualizers, spatial audio, or any app that uses the Web Audio API.
  Provides reactive audio state, scheduling, parameter automation, and React
  bindings. Guides correct audio/UI separation and scheduling patterns.
---

# Audiorective

Modular toolkit for web audio app development. Reactive primitives that bridge
Web Audio's imperative API with UI frameworks.

## When to use

- Building anything with the Web Audio API
- Need reactive audio parameters that sync with UI
- Need sample-accurate scheduling (sequencers, drum machines, loopers)
- Want audio state management without duplicating state between audio and UI

## Packages

| Package                    | Purpose                                                                                                                                      | Reference                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `@audiorective/core`       | Reactive audio primitives, `AudioProcessor`, engine, `Spatial`, `Analyser`, `Sampler`, `BufferPlayer`, `FilePlayer`. Required by everything. | `references/core.md`            |
| `@audiorective/clock`      | Timing/scheduling engine — transport, tempo, look-ahead tick windows, rulers (bars, cycles/loops, seconds).                                  | `references/clock.md`           |
| `@audiorective/react`      | React bindings (`useValue`, `EngineProvider`, `useEngine`).                                                                                  | `references/react.md`           |
| _(any framework)_          | Client-only boundary for server-rendered apps (Next.js, Remix, Astro) and the `EngineEnvironmentError` it prevents.                          | `references/client-boundary.md` |
| `@audiorective/threejs`    | three.js scene bindings (`attach`, `PannerAnchor`).                                                                                          | `references/threejs.md`         |
| `@audiorective/playcanvas` | PlayCanvas scene bindings (`attach`, `bindPanner`).                                                                                          | `references/playcanvas.md`      |

## What to read next

**Always start with `references/core.md`** — every other package depends on it, and most tasks need its API surface.

Then load only what your task actually needs:

| If you're doing…                                                                | Also read                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Designing a whole audio app (multiple sources, multiple UIs, spatial)           | `references/designing-audio-apps.md`           |
| Choosing a playback primitive (Sampler vs BufferPlayer vs FilePlayer)           | `references/choosing-playback.md`              |
| Playing a sample / SFX, a beat-locked loop, or streaming a track                | `references/core.md`                           |
| Sequencing, scheduling, transport, tempo, or a step sequencer/drum machine      | `references/clock.md`                          |
| Building a synth, sequencer, or DSP processor                                   | `references/architecture.md`                   |
| Writing or modifying an `AudioProcessor` subclass                               | the `audio-processor-authoring` skill          |
| React UI bound to an engine                                                     | `references/react.md`                          |
| Next.js / Remix / Astro / any app that renders on a server                      | `references/client-boundary.md`                |
| Hitting `EngineEnvironmentError`, or "AudioContext is not defined" in a build   | `references/client-boundary.md`                |
| 3D scene with spatial audio (three.js)                                          | `references/threejs.md` + `architecture.md`    |
| 3D scene with spatial audio (PlayCanvas)                                        | `references/playcanvas.md` + `architecture.md` |
| PixiJS (2D) audio visualizer or interactive canvas                              | `references/pixijs.md`                         |
| Sharing state between React and an imperative view (Three.js, Canvas2D, WebGPU) | `references/architecture.md`                   |
| Understanding rationale ("why does this exist?")                                | `references/overview.md`                       |

## Version mismatches

This skill and the `@audiorective/*` npm packages install through different
channels (plugin/skills CLI vs. npm), so they can drift — a project may have an
older package than the APIs documented here.

If you hit an **API surprise** — `X is not a function`, an `undefined` import, a
missing export, or a type/compile error on an API this skill documents — suspect
the installed package predates the docs. Then:

1. Read `references/changelog.md` to find which version introduced (or changed)
   the API.
2. Check the installed version — `node_modules/@audiorective/core/package.json`
   (the resolved version), falling back to the dependency range in the project's
   `package.json`.
3. If the API postdates the installed version, tell the user to upgrade the npm
   package (e.g. `npm i @audiorective/core@latest`) before continuing — don't
   work around it by hand-rolling the missing API.

## audiorective is client-only

**Never let an engine module be evaluated on the server.** `createEngine` builds a real
`AudioContext`; there is none in Node, and there is no SSR mode to enable — this is a
design decision, not a gap.

In Next.js, Remix, or Astro, mount the audio subtree behind a client-only boundary —
`next/dynamic(..., { ssr: false })` or `client:only` — and keep `createEngine` at module
scope **inside** that subtree, which is correct and canonical there. `'use client'` is not
a boundary: it bundles the module for the client but the server still evaluates it.

Seeing **`EngineEnvironmentError`** means an audio module leaked across the boundary. Do not
work around it with a lazy accessor, a nullable engine, or a `typeof window` guard — find the
import path that reaches the engine module and move it inside the island. Read
`references/client-boundary.md`.

## The one rule that always applies

**Audio operations live as methods on `AudioProcessor` subclasses.** UI components call these methods — they never orchestrate audio logic themselves.

- **Audio layer owns:** graph construction, envelope shaping, parameter automation, transport logic, anything touching `AudioContext.currentTime`.
- **UI layer does:** read params (`useValue(processor.params.foo)`), set params (`processor.params.foo.value = x`), call audio methods (`synth.filterSweep()`).

**Litmus test:** _Can I run this audio behavior from a unit test with no DOM?_ If not, it's in the wrong layer.

Wrong — scheduling in React:

```typescript
const handleSweep = useCallback(() => {
  const now = synth.context.currentTime;
  synth.params.cutoff.setValueAtTime(synth.params.cutoff.value, now);
  synth.params.cutoff.linearRampToValueAtTime(18000, now + 1);
}, [synth]);
```

Right — method on processor, thin UI call:

```typescript
class StepSynth extends AudioProcessor<{ cutoff: SchedulableParam }> {
  filterSweep(peakFreq = 18000, duration = 2) {
    const now = this.context.currentTime;
    const cur = this.params.cutoff.value;
    this.params.cutoff.setValueAtTime(cur, now);
    this.params.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.params.cutoff.linearRampToValueAtTime(cur, now + duration);
  }
}

const handleSweep = useCallback(() => synth.filterSweep(), [synth]);
```

For the full architecture guide — Cell vs Param choices, automation gotchas, structured state via `Cell`, and the React/imperative-view decoupling pattern — read `references/architecture.md`.
