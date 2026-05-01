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

### @audiorective/core

Reactive audio primitives. The foundation.

**Exports:** `Param`, `SchedulableParam`, `ParamSync`, `AudioProcessor`, `AudioEngine`, `createEngine`, `Cell`, `cell`, `Spatial`, `SpatialOptions`

- `Param` — reactive parameter, set `.value` to update
- `SchedulableParam` — numeric param with Web Audio scheduling methods (ramps, setTargetAtTime, etc.)
- `Cell` — standalone reactive container for structured/complex data (step patterns, presets, config). Uses Immer `produce` for ergonomic `.update(draft => ...)` mutations. Not tied to AudioProcessor.
- `AudioProcessor` — base class for audio components, owns graph + params + lifecycle
- `AudioEngine` / `createEngine()` — singleton audio context + processor graph
- `engine.autoStart(target, options?)` — arm gesture listeners on any `EventTarget`; calls `start()` on first interaction, re-arms on state drops, auto-disarms on destroy. Returns a detach function.
- `Spatial` — `AudioProcessor` owning a `PannerNode` (HRTF). `input` (GainNode) + `output` (panner) for graph wiring; seven reactive params (`refDistance`, `maxDistance`, `rolloffFactor`, `distanceModel`, `coneInnerAngle`, `coneOuterAngle`, `coneOuterGain`). Position/orientation are regular `AudioParam`s on `spatial.panner` — `@audiorective/threejs` provides `PannerAnchor` to sync them from a scene Object3D.

> For full API reference: read `references/core.md`

### @audiorective/react

React bindings. Thin observation layer — no state duplication.

- `useValue(source)` — subscribe to any `Readable<T>` (Param, Cell) or `ComputedAccessor<T>`, re-renders on change. Read-only snapshot; mutate via `param.value = x` directly on the source.
- `createEngineContext(engine)` — EngineProvider (auto-start on gesture) + useEngine hook

> For full API reference: read `references/react.md`

### @audiorective/clock (design phase)

Look-ahead scheduling engine. Beat-based timing (Ableton Link style).

- One clock, one tick callback, non-overlapping windows
- Numeric beats only — no string notation ("4n", "1:2:3")
- Miss detection: reports gaps, doesn't pretend to recover

> For full API reference: read `references/clock.md`

### @audiorective/threejs

Three.js bindings for `@audiorective/core`. The integration layer between the engine and a three.js scene — audio always lives in core; this package provides the scene-side glue (engine context wiring, scene transform sync, and any future binding that needs the renderer or `Object3D` graph).

**Exports:** `attach`, `PannerAnchor`

- `attach(engine, renderer)` — sets `THREE.AudioContext` to the engine's context and auto-starts on first canvas gesture. Returns a detach function.
- `PannerAnchor` — `Object3D` that takes an externally-owned `PannerNode` (usually `coreSpatial.panner`) and syncs its world position + forward vector into `panner.positionX/Y/Z` and `panner.orientationX/Y/Z` via `updateMatrixWorld`. Does not own the panner — removing the anchor from the scene does not disconnect the audio.

> For full API reference: read `references/threejs.md`

## Architecture Rules

### Audio/UI Separation (CRITICAL)

All audio operations live as methods on `AudioProcessor` subclasses. UI components call these methods — they never orchestrate audio logic themselves.

**Audio layer owns:** graph construction, envelope shaping, parameter automation, transport logic, anything touching `AudioContext.currentTime`

**UI layer does:** read params (`useValue(processor.params.foo)`), set params (`processor.params.foo.value = x`), call audio methods (`synth.filterSweep()`)

**Litmus test:** Can I run this audio behavior from a unit test with no DOM? If not, it's in the wrong layer.

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
class StepSynth extends AudioProcessor<{ cutoff: SchedulableParam /* ... */ }> {
  // constructor sets up params via super() build callback (see references/core.md)

  filterSweep(peakFreq = 18000, duration = 2) {
    const now = this.context.currentTime;
    const cur = this.params.cutoff.value;
    this.params.cutoff.setValueAtTime(cur, now);
    this.params.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.params.cutoff.linearRampToValueAtTime(cur, now + duration);
  }
}

// UI — just a trigger
const handleSweep = useCallback(() => synth.filterSweep(), [synth]);
```

> For full architecture guide: read `references/architecture.md`

### AudioParam Automation Gotchas

- Always anchor with `setValueAtTime(currentValue, now)` before any ramp
- Call `cancelScheduledValues(now)` before starting a new automation sequence
- Don't bind a volume param directly to an envelope gain node — use a separate gain

### Engine Setup Pattern

```typescript
import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";

export const engine = createEngine((ctx) => {
  const synth = new MySynth(ctx);
  const sequencer = new MySequencer(synth);
  synth.output.connect(ctx.destination);
  return { synth, sequencer };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);

// Auto-starts on first user gesture (click/keydown/touchstart)
<EngineProvider>
  <SynthUI />
</EngineProvider>
```

### Three.js Engine Setup Pattern

Audio and 3D scene are decoupled: the engine owns every `Spatial` (and thus every `PannerNode`), so sound works even with no three.js mounted. The `@audiorective/threejs` layer only provides a scene binding.

```typescript
import * as THREE from "three";
import { createEngine, Spatial } from "@audiorective/core";
import { attach, PannerAnchor } from "@audiorective/threejs";

const engine = createEngine((ctx) => {
  const synth = new MySynth(ctx);
  const spatial = new Spatial(ctx, { distanceModel: "inverse" });
  synth.output.connect(spatial.input);
  spatial.output.connect(ctx.destination); // audio works with no scene
  return { synth, spatial };
});

const renderer = new THREE.WebGLRenderer({ canvas });
attach(engine, renderer); // sets THREE.AudioContext, auto-starts on canvas gesture

const listener = new THREE.AudioListener();
camera.add(listener); // keeps ctx.listener tracking the camera's transform

const anchor = new PannerAnchor(engine.spatial.panner);
anchor.add(mesh);
scene.add(anchor); // mesh position now pans the audio via updateMatrixWorld
```

`attach` must run before constructing `THREE.AudioListener` — it calls `THREE.AudioContext.setContext` so the listener is wired to the engine's context.

`PannerAnchor` does **not** own the panner. Unmounting the scene leaves the audio running at the last-written position; lifetime is owned by whoever destroys the `Spatial`.

### Decouple React from Imperative Views

When React shares the screen with an imperative renderer (Three.js scene, Canvas2D, WebGPU, etc.), put **any state both views read or write** — selection, hover, mode, drag target, anything — on the engine as a `Cell` or `Param`. Both views then observe the engine independently. Do not let React own the shared state and thread it into the imperative side via refs or callbacks; that creates back-channels and lifecycle bugs.

- React reads with `useValue(engine.foo)`, writes with `engine.foo.value = x`.
- The imperative view reads with alien-signals `effect(() => engine.foo.$())`, writes with the same `.value =` setter.

The React component for the imperative view collapses to a DOM host that constructs the scene class, mounts it, and disposes on unmount. No props, no `useRef` mirrors of React state, no callbacks crossing the boundary.

Wrong — React owns state, scene needs back-channels:

```typescript
function SpatialPanner({ selectedId, onSelect }: Props) {
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  // ...200 lines of three.js reading refs and calling onSelectRef.current(...)
}
```

Right — engine owns state, React and the scene are peers:

```typescript
// engine.ts — selection is engine state, not React state
export const engine = createEngine((ctx) => {
  const tracks = buildTracks(ctx);
  const selectedTrackId = cell<string>(tracks[0].id);
  return { tracks, selectedTrackId };
});

// scene/SpatialScene.ts — plain TS class, no React
import { effect } from "alien-signals";
class SpatialScene {
  constructor() {
    // ...
    this.disposers.push(effect(() => this.syncSelection(engine.selectedTrackId.$())));
  }
  private onPointerDown(/* ... */) {
    engine.selectedTrackId.value = entry.track.id; // write directly
  }
}

// SpatialPanner.tsx — DOM host only, ~15 lines
function SpatialPanner() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scene = new SpatialScene();
    scene.mount(ref.current!);
    return () => scene.dispose();
  }, []);
  return <div ref={ref} />;
}

// Any other React component reads/writes the same Cell
function TrackMatrix() {
  const { selectedTrackId } = useEngine();
  const id = useValue(selectedTrackId);
  // onSelect: selectedTrackId.value = track.id
}
```

The scene class becomes plain TypeScript — testable and mountable without React. This is the audio/UI separation principle extended to UI/UI: the engine is the meeting point for _every_ observer. See `apps/sequencer-poc/src/scene/SpatialScene.ts` for a worked example.

### Cell vs Param

| Use case                                         | Primitive                            | Why                                                |
| ------------------------------------------------ | ------------------------------------ | -------------------------------------------------- |
| Numeric audio value, needs ramps/scheduling      | `Param` (`param`/`schedulableParam`) | Backs an `AudioParam`; lives in `processor.params` |
| Simple reactive value (BPM, boolean, enum)       | `Param` (`param`)                    | Lightweight; lives in `processor.params`           |
| Structured data (step patterns, presets, config) | `Cell` (`cell` helper or standalone) | Immer-based `.update()`                            |
| State that doesn't belong to an AudioProcessor   | `Cell` (standalone)                  | Usable anywhere                                    |

`Param` is for values that an `AudioProcessor` exposes as part of its parameter surface (lives under `processor.params`). `Cell` is for structured/complex reactive state — either attached to a processor via `processor.cells`, or standalone for plain classes.

## Key Design Decisions

- alien-signals 3.x callable API — signals are callable functions (`signal()` to read, `signal(value)` to write), not objects with `.get()`/`.set()`. `SignalAccessor<T>` and `ComputedAccessor<T>` are defined in types.ts.
- `.value` over function-call syntax — matches Web Audio conventions
- `param()` not decorators — method-based, type-safe, discoverable
- `$` prefix for raw signal access — escape hatch for framework adapters
- `Cell` for structured state — Immer `produce` for ergonomic immutable updates, separate from param system
- Classes that only hold structured state (no audio nodes, no scheduling) should be plain classes with `Cell`, not AudioProcessor subclasses
- Clock doesn't own state — signals own state, clock provides timing windows
- rAF polling for AudioParam→signal sync at ~60fps — pragmatic tradeoff
- `bind` option unifies AudioParam backing and custom sync into one field
- No state duplication — AudioProcessor owns all state, UI observes/mutates directly
