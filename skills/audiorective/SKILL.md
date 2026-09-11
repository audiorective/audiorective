---
name: audiorective
description: >
  Build web audio apps with the @audiorective/* packages — synthesizers, drum
  machines and step sequencers, DAW-style transports, samplers and loop players,
  audio visualizers, positional/3D audio attached to three.js or PlayCanvas
  objects, effects racks, and offline rendering or WAV export of a Web Audio
  graph. Use whenever a project depends on @audiorective/*, whenever an error
  names one of its APIs (EngineEnvironmentError, createEngine, defineGraph,
  LatencyUnknownError), and whenever the user asks for reactive audio state
  bound to a UI, sample-accurate scheduling or tempo, parameter automation,
  audio/UI separation, or to replace or migrate away from Tone.js — even if
  they never say "audiorective" and even when the request touches the Web Audio
  API (AudioContext, AudioParam, AudioWorklet) only indirectly.
license: MIT
compatibility: Browser runtime with the Web Audio API (client-only, no server rendering). TypeScript or JavaScript. Packages install from npm as @audiorective/*.
---

# Audiorective

Modular toolkit for web audio apps. An `AudioProcessor` owns the Web Audio nodes
and all audio state as reactive params; UI frameworks observe and mutate that
state directly, so nothing is duplicated between the audio graph and the view.

> **Setup:** see [Installation](references/installation.md) for which packages to
> install, peer dependencies, and keeping versions aligned.

## Quick start

Install the core package and, for React, the bindings:

```sh
npm install @audiorective/core @audiorective/react
```

A processor owns nodes, exposes them as params, and puts audio behaviour in
methods. Nodes are built as locals _before_ `super()` so the build callback can
close over them:

```typescript
import { AudioProcessor, createEngine, type Param, type SchedulableParam } from "@audiorective/core";

class Synth extends AudioProcessor<{ volume: SchedulableParam; bpm: Param<number> }> {
  private readonly _gain: GainNode;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    super(ctx, ({ param }) => ({
      params: {
        volume: param({ default: 0.5, bind: gain.gain }), // AudioParam-backed → sample-accurate
        bpm: param({ default: 120 }), // plain reactive value
      },
    }));
    this._gain = gain;
  }

  get output() {
    return this._gain;
  }

  fadeOut(seconds = 2) {
    const now = this.context.currentTime;
    this.params.volume.setValueAtTime(this.params.volume.value, now);
    this.params.volume.linearRampToValueAtTime(0, now + seconds);
  }
}

// audio/engine.ts — module scope is correct here, as long as this module only
// ever loads in the browser (see "client-only" below)
export const engine = createEngine((ctx) => {
  const synth = new Synth(ctx);
  synth.output.connect(ctx.destination);
  return { synth };
});
```

The `AudioContext` starts suspended by browser autoplay policy. Resume it from a
user gesture — `engine.core.start()` in a click handler, or
`engine.core.autoStart(document)` to do that on the first click/key/touch.

**React** — the provider auto-starts the engine on the first gesture; `useValue`
subscribes a component to a param and the component writes back directly:

```tsx
import { createEngineContext, useValue } from "@audiorective/react";
import { engine } from "./audio/engine";

export const { EngineProvider, useEngine } = createEngineContext(engine);

function VolumeSlider() {
  const { synth } = useEngine();
  const volume = useValue(synth.params.volume);
  const setVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    synth.params.volume.value = +e.target.value; // write straight to the processor
  };
  return <input type="range" min={0} max={1} step={0.01} value={volume} onChange={setVolume} />;
}

export function App() {
  return (
    <EngineProvider>
      <VolumeSlider />
      <button onClick={() => engine.synth.fadeOut()}>Fade</button>
    </EngineProvider>
  );
}
```

Vanilla, three.js, PlayCanvas, and Pixi follow the same shape: build the engine
once, read params through `effect()`/`useValue`, write with `.value`, and call
processor methods for anything scheduled.

## Packages

| Package                    | Purpose                                                                                                                                         | Reference                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `@audiorective/core`       | Reactive audio primitives, `AudioProcessor`, engine, `defineGraph`, `Spatial`, `Analyser`, `Sampler`, `BufferPlayer`, `FilePlayer`. Required.   | `references/core.md`       |
| `@audiorective/clock`      | Timing/scheduling engine — transport, tempo, look-ahead tick windows, rulers (bars, cycles/loops, seconds).                                     | `references/clock.md`      |
| `@audiorective/effects`    | DSP effects — Filter, Distortion, Phaser, FrequencyShifter, PingPongDelay, Convolver, Compressor, Limiter, PitchShift; Channel strip + SendBus. | `references/effects.md`    |
| `@audiorective/react`      | React bindings (`useValue`, `createEngineContext` → `EngineProvider`, `useEngine`).                                                             | `references/react.md`      |
| `@audiorective/threejs`    | three.js scene bindings (`attach`, `PannerAnchor`).                                                                                             | `references/threejs.md`    |
| `@audiorective/playcanvas` | PlayCanvas scene bindings (`attach`, `bindPanner`).                                                                                             | `references/playcanvas.md` |
| `@audiorective/devtools`   | `measureLatency` / `assertLatency` for testing a processor's declared latency.                                                                  | `references/core.md`       |

## What to read next

**`references/core.md` is the API reference for everything** (1100 lines). Read
the section you need rather than the whole file:

| Task                                                            | Section of `core.md`                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| Param vs SchedulableParam vs Cell, `bind` rules, `.value` / `$` | Core Concepts; API Reference → Param, SchedulableParam, Cell |
| Automation ramps that don't behave                              | API Reference → Automation Gotchas                           |
| Wiring processors together, bypass, latency compensation        | API Reference → Graph helpers (`defineGraph`), Latency (PDC) |
| Playing samples, loops, or a streamed track                     | Sound Playback                                               |
| Engine lifecycle, autoplay, `createEngine`                      | AudioEngine                                                  |
| Spatial audio, spectrum/waveform analysis                       | API Reference → Spatial, Analyser                            |

Then load only what the task needs:

| If you're doing…                                                                | Also read                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Designing a whole audio app (multiple sources, multiple UIs, spatial)           | `references/designing-audio-apps.md`           |
| Choosing a playback primitive (Sampler vs BufferPlayer vs FilePlayer)           | `references/choosing-playback.md`              |
| Sequencing, transport, tempo, a step sequencer or drum machine                  | `references/clock.md`                          |
| Deciding what goes in the audio layer vs the UI; Cell vs Param                  | `references/architecture.md`                   |
| Writing or modifying an `AudioProcessor` subclass                               | the `audio-processor-authoring` skill          |
| React UI bound to an engine                                                     | `references/react.md`                          |
| Next.js / Remix / Astro / any app that renders on a server                      | `references/client-boundary.md`                |
| 3D scene with spatial audio (three.js)                                          | `references/threejs.md` + `architecture.md`    |
| 3D scene with spatial audio (PlayCanvas)                                        | `references/playcanvas.md` + `architecture.md` |
| PixiJS (2D) audio visualizer or interactive canvas                              | `references/pixijs.md`                         |
| Sharing state between React and an imperative view (three.js, Canvas2D, WebGPU) | `references/architecture.md`                   |
| Adding effects, building an FX rack, replacing Tone.js effects, offline export  | `references/effects.md`                        |
| Understanding rationale ("why does this exist?")                                | `references/overview.md`                       |

## The one rule that always applies

**Audio operations live as methods on `AudioProcessor` subclasses.** UI
components call these methods — they never orchestrate audio logic themselves.

- **Audio layer owns:** graph construction, envelope shaping, parameter
  automation, transport logic, anything touching `AudioContext.currentTime`.
- **UI layer does:** read params (`useValue(processor.params.foo)`), set params
  (`processor.params.foo.value = x`), call audio methods (`synth.filterSweep()`).

**Litmus test:** _Can I run this audio behaviour from a unit test with no DOM?_
If not, it's in the wrong layer.

Wrong — scheduling in React:

```typescript
const handleSweep = useCallback(() => {
  const now = synth.context.currentTime;
  synth.params.cutoff.setValueAtTime(synth.params.cutoff.value, now);
  synth.params.cutoff.linearRampToValueAtTime(18000, now + 1);
}, [synth]);
```

Right — method on the processor, thin UI call:

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

`references/architecture.md` has the full guide — Cell vs Param choices,
automation gotchas, structured state via `Cell`, and decoupling React from an
imperative view.

## audiorective is client-only

`createEngine` builds a real `AudioContext`; there is none on a server, and
there is no SSR mode to enable. In Next.js, Remix, or Astro, mount the audio
subtree behind a client-only boundary — `next/dynamic(..., { ssr: false })` or
`client:only` — and keep `createEngine` at module scope _inside_ that subtree.
`'use client'` is not a boundary: the server still evaluates the module.

`EngineEnvironmentError` means an audio module leaked across the boundary. Don't
patch it with a lazy accessor, a nullable engine, or a `typeof window` guard —
find the import path that reaches the engine module and move it inside the
island. Read `references/client-boundary.md`.

## Version mismatches

This skill and the npm packages install through different channels, so a
project may have an older package than the APIs documented here. On an API
surprise — `X is not a function`, an `undefined` import, a missing export, or a
type error on a documented API:

1. Read `references/changelog.md` to find the version that introduced or
   changed the API.
2. Check the installed version:
   `node -p "require('@audiorective/core/package.json').version"`.
3. If the API postdates the installed version, tell the user to upgrade
   (`npm i @audiorective/core@latest`, all `@audiorective/*` together) rather
   than hand-rolling the missing API.

## Common errors

| Symptom                                                                 | Cause                                                            | Fix                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `EngineEnvironmentError: createEngine() is client-only…` during a build | An engine module is evaluated on the server                      | Move the importer inside the client-only island — `references/client-boundary.md`             |
| `EngineEnvironmentError: … no AudioContext constructor` in a jsdom test | DOM without Web Audio                                            | Pass a mock context: `createEngine(setup, { context })`, or run in a real browser             |
| No sound; `engine.core.state` stays `"idle"`                            | `AudioContext` suspended by autoplay policy                      | Call `engine.core.start()` from a user gesture, or use `autoStart` (on by default in React)   |
| `X is not a function` / `undefined` import on a documented API          | Installed package predates the docs                              | "Version mismatches" above                                                                    |
| UI silently stops updating, no error                                    | Two copies of `alien-signals` in the bundle                      | Dedupe or alias the package — `references/installation.md`                                    |
| `LatencyUnknownError: X's path latency is unknown`                      | A latency query on a processor that appears in no `defineGraph`  | Wire it with `defineGraph` (its own or the engine's) instead of raw `.connect()`              |
| `defineGraph: X is a bare AudioWorkletNode`                             | A worklet node used directly as an edge endpoint                 | Wrap it in an `AudioProcessor` that declares `latency` — `audio-processor-authoring` skill    |
| `defineGraph: X used as sink has no input`                              | Routing audio into an instrument or player                       | Only effects have `input`; instruments are sources. Check the edge direction                  |
| `WorkletUnavailableError` from `@audiorective/effects`                  | Context without `audioWorklet` (old browser, some test contexts) | Use a browser with AudioWorklet, or the `granular` `PitchShift` engine which needs no worklet |
| `Cannot start a destroyed engine`                                       | Reusing an engine after `destroy()`                              | Create a new engine; `destroy()` is final                                                     |

## References

- [Installation](references/installation.md) — packages, peers, version alignment, environment
- [Core](references/core.md) — full API reference
- [Architecture](references/architecture.md) — audio vs UI layer, Cell vs Param
- [Designing Audio Apps](references/designing-audio-apps.md) — methodology for a whole app
- [Choosing Playback](references/choosing-playback.md) — Sampler vs BufferPlayer vs FilePlayer
- [Clock](references/clock.md) · [Effects](references/effects.md) · [React](references/react.md)
- [three.js](references/threejs.md) · [PlayCanvas](references/playcanvas.md) · [PixiJS](references/pixijs.md)
- [Server-rendered frameworks](references/client-boundary.md)
- [Overview](references/overview.md) · [Changelog](references/changelog.md)
