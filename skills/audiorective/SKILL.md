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

**Exports:** `Param`, `SchedulableParam`, `ParamSync`, `AudioProcessor`, `AudioEngine`, `createEngine`, `Cell`, `cell`

- `Param` — reactive parameter, set `.value` to update
- `SchedulableParam` — numeric param with Web Audio scheduling methods (ramps, setTargetAtTime, etc.)
- `Cell` — standalone reactive container for structured/complex data (step patterns, presets, config). Uses Immer `produce` for ergonomic `.update(draft => ...)` mutations. Not tied to AudioProcessor.
- `AudioProcessor` — base class for audio components, owns graph + params + lifecycle
- `AudioEngine` / `createEngine()` — singleton audio context + processor graph

> For full API reference: read `references/core.md`

### @audiorective/react

React bindings. Thin observation layer — no state duplication.

- `useValue(source: Readable<T>)` — subscribe to any readable (Param or Cell), re-renders on change
- `useParam(param)` — `[value, setValue]` tuple
- `useComputed(computed)` — subscribe to computed value
- `useProcessor(factory, deps)` — create processor, auto-destroy on unmount
- `createProcessorContext<T>()` — typed Provider + hook
- `createEngineContext(engine)` — EngineProvider with Suspense or overlay mode

> For full API reference: read `references/react.md`

### @audiorective/clock (design phase)

Look-ahead scheduling engine. Beat-based timing (Ableton Link style).

- One clock, one tick callback, non-overlapping windows
- Numeric beats only — no string notation ("4n", "1:2:3")
- Miss detection: reports gaps, doesn't pretend to recover

> For full API reference: read `references/clock.md`

### @audiorective/threejs (design phase)

Three.js spatial audio integration via wrapping, not a parallel audio system.

> For full API reference: read `references/threejs.md`

## Architecture Rules

### Audio/UI Separation (CRITICAL)

All audio operations live as methods on `AudioProcessor` subclasses. UI components call these methods — they never orchestrate audio logic themselves.

**Audio layer owns:** graph construction, envelope shaping, parameter automation, transport logic, anything touching `AudioContext.currentTime`

**UI layer does:** read params (`useValue`), set params (`.value = x`), call audio methods (`synth.filterSweep()`)

**Litmus test:** Can I run this audio behavior from a unit test with no DOM? If not, it's in the wrong layer.

Wrong — scheduling in React:

```typescript
const handleSweep = useCallback(() => {
  const now = synth.context.currentTime;
  synth.cutoff.setValueAtTime(synth.cutoff.value, now);
  synth.cutoff.linearRampToValueAtTime(18000, now + 1);
}, [synth]);
```

Right — method on processor, thin UI call:

```typescript
class StepSynth extends AudioProcessor {
  filterSweep(peakFreq = 18000, duration = 2) {
    const now = this.context.currentTime;
    const cur = this.cutoff.value;
    this.cutoff.setValueAtTime(cur, now);
    this.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.cutoff.linearRampToValueAtTime(cur, now + duration);
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

// Suspense mode
<EngineProvider fallback={<button onClick={() => engine.core.start()}>Start</button>}>
  <SynthUI />
</EngineProvider>

// Overlay mode — auto-starts on first user gesture
<EngineProvider autoStart>
  <SynthUI />
</EngineProvider>
```

### Cell vs Param

| Use case                                         | Primitive                    | Why                                                     |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------- |
| Numeric audio value, needs ramps/scheduling      | `Param` (via `this.param()`) | Backs an `AudioParam`, auto-discovered by `getParams()` |
| Simple reactive value (BPM, boolean, enum)       | `Param` (via `this.param()`) | Lightweight, auto-discovered                            |
| Structured data (step patterns, presets, config) | `Cell`                       | Immer-based `.update()`, not tied to AudioProcessor     |
| State that doesn't belong to an AudioProcessor   | `Cell`                       | Standalone, usable anywhere                             |

`Param` is for values that AudioProcessor manages and that `getParams()` discovers. `Cell` is for everything else — structured data, standalone state, data owned by plain classes.

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
