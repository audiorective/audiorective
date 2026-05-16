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

| Package                    | Purpose                                                                                                    | Reference                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| `@audiorective/core`       | Reactive audio primitives, `AudioProcessor`, engine, `Spatial`. Required by everything.                    | `references/core.md`       |
| `@audiorective/react`      | React bindings (`useValue`, `EngineProvider`, `useEngine`).                                                | `references/react.md`      |
| `@audiorective/threejs`    | three.js scene bindings (`attach`, `PannerAnchor`).                                                        | `references/threejs.md`    |
| `@audiorective/playcanvas` | PlayCanvas bindings (`attach`, `createAudiorectiveSlot`). Pre-panner/pre-gain FX injection on `SoundSlot`. | `references/playcanvas.md` |

## What to read next

**Always start with `references/core.md`** — every other package depends on it, and most tasks need its API surface.

Then load only what your task actually needs:

| If you're doing…                                                                | Also read                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Building a synth, sequencer, or DSP processor                                   | `references/architecture.md`                   |
| React UI bound to an engine                                                     | `references/react.md`                          |
| 3D scene with spatial audio (three.js)                                          | `references/threejs.md` + `architecture.md`    |
| 3D scene with spatial audio (PlayCanvas) or pre-panner FX on SoundSlot          | `references/playcanvas.md` + `architecture.md` |
| Sharing state between React and an imperative view (Three.js, Canvas2D, WebGPU) | `references/architecture.md`                   |
| Understanding rationale ("why does this exist?")                                | `references/overview.md`                       |

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
