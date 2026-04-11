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

- `useValue(source)` — subscribe to any `Readable<T>` (Param, Cell) or `ComputedAccessor<T>`, re-renders on change. Read-only snapshot; mutate via `param.value = x` directly on the source.
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
