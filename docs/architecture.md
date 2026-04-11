# Architecture — Audio/UI Separation

The audio layer must be fully operable without any UI framework. React (or any future binding) is a thin observation and mutation layer on top.

## The Rule

**All audio operations live as methods on `AudioProcessor` subclasses.** UI components call these methods — they never orchestrate audio logic themselves.

## What belongs where

### Audio layer (`AudioProcessor` subclasses)

- Audio graph construction and wiring
- Envelope shaping, note triggering
- Parameter automation sequences (ramps, sweeps, scheduled transitions)
- Transport logic (start, stop, scheduling loops)
- Any operation that touches `AudioContext.currentTime` or schedules values on `AudioParam`

### Structured state (plain classes with `Cell`)

- Step patterns, drum grids, sequence data
- Presets, configuration objects
- Any complex/nested state that doesn't own AudioNodes or do scheduling

Classes that only hold structured state should **not** extend `AudioProcessor`. Use `Cell` instead.

### UI layer (React components, etc.)

- Reading param values for display (`useValue(synth.volume)`)
- Reading cell values for display (`useValue(sequencer.pattern)`)
- Setting param values from user input (`synth.volume.value = 0.8`)
- Calling audio-layer methods (`synth.filterSweep()`, `sequencer.rampBpm(180, 4)`)
- Layout, styling, conditional rendering

## Examples

### Wrong — audio scheduling in React

```typescript
// Component knows about AudioContext timing and scheduling API
const handleFilterSweep = useCallback(() => {
  const now = synth.context.currentTime;
  const currentCutoff = synth.cutoff.value;
  synth.cutoff.setValueAtTime(currentCutoff, now);
  synth.cutoff.linearRampToValueAtTime(18000, now + 1);
  synth.cutoff.linearRampToValueAtTime(currentCutoff, now + 2);
}, [synth]);
```

### Right — audio method, thin UI call

```typescript
// Audio layer — self-contained, testable, no UI dependency
class StepSynth extends AudioProcessor {
  filterSweep(peakFreq = 18000, duration = 2): void {
    const now = this.context.currentTime;
    const currentCutoff = this.cutoff.value;
    this.cutoff.setValueAtTime(currentCutoff, now);
    this.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.cutoff.linearRampToValueAtTime(currentCutoff, now + duration);
  }
}

// UI layer — just a trigger
const handleFilterSweep = useCallback(() => {
  synth.filterSweep();
}, [synth]);
```

### Simple `.value` assignments are fine in UI

```typescript
// This is OK — .value is the Param public API, not audio scheduling
<input onChange={(e) => synth.volume.value = Number(e.target.value)} />
```

Setting `.value` is a direct property assignment on the Param abstraction. It's the intended interface between UI and audio. No need to wrap these in setter methods.

### Wrong — sequencer as AudioProcessor when it has no audio nodes

```typescript
class DrumSequencer extends AudioProcessor<{ pattern: Param<boolean[]> }> {
  constructor(ctx: AudioContext) {
    super(ctx, ({ param }) => ({
      params: { pattern: param({ default: Array(16).fill(false) }) },
    }));
  }

  get output() {
    return undefined; // no audio output — red flag
  }
}
```

### Right — plain class with Cell for structured state

```typescript
class DrumSequencer {
  readonly pattern = cell<boolean[]>(Array(16).fill(false));

  toggleStep(index: number) {
    this.pattern.update((draft) => {
      draft[index] = !draft[index];
    });
  }
}
```

`AudioProcessor` is for things that actually process audio (own AudioNodes, use scheduling). If a class just holds data, it's a plain class with `Cell`.

## Why this matters

1. **Testability** — Audio behaviors can be tested without mounting components or simulating DOM events.
2. **Portability** — Same audio code works with React, Vue, Three.js, or no UI at all (headless, CLI, Node.js with web audio polyfill).
3. **Clarity** — Components become declarative bindings. Audio classes own all temporal and scheduling complexity.
4. **Composability** — Audio operations can call each other. A `Sequencer` can call `synth.filterSweep()` as part of a pattern, not just UI event handlers.

## Litmus test

> Can I run this audio behavior from a unit test or a script with no DOM?

If not, the logic is in the wrong layer.
