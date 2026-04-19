# @audiorective/react

React bindings for audiorective signals. Direct mutation model — no dispatch, no actions. The processor is the source of truth.

## Dependencies

```json
{
  "dependencies": {
    "@audiorective/core": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  }
}
```

## Package Structure

```
react/src/
├── hooks.ts
├── context.tsx
└── index.ts
```

---

## Hooks

### `useValue(source)`

Subscribe to a reactive source. Accepts either:

- A `Readable<T>` — `Param`, `SchedulableParam`, or `Cell`
- A `ComputedAccessor<T>` — a callable `() => T` produced by `alien-signals` `computed` or `this.computed(...)` inside an `AudioProcessor`

Re-renders when the value changes. Always returns a read-only snapshot — to mutate, write to the source directly (`param.value = x`, `cell.update(...)`). Computeds have no setter on the source, so they are read-only by construction.

```typescript
// Param
const volume = useValue(synth.volume);

// Cell
const pattern = useValue(sequencer.pattern); // Cell<StepPattern>

// Computed
const label = useValue(synth.displayLabel); // ComputedAccessor<string>
```

#### Writing back — direct mutation

```typescript
function VolumeSlider({ synth }) {
  const volume = useValue(synth.volume);
  return (
    <input
      type="range"
      value={volume}
      onChange={(e) => {
        synth.volume.value = +e.target.value;
      }}
    />
  );
}
```

#### Cell example

```typescript
function StepGrid() {
  const { sequencer } = useEngine();
  const pattern = useValue(sequencer.pattern); // Cell<boolean[]>

  return (
    <div>
      {pattern.map((active, i) => (
        <button key={i} data-active={active} onClick={() => sequencer.toggleStep(i)} />
      ))}
    </div>
  );
}
```

---

## Context

### `createEngineContext(engine)`

Creates a typed `EngineProvider` and `useEngine` hook for an engine created by `createEngine`. Accepts `T extends { core: AudioEngine }`. Works with React 18 and 19.

`EngineProvider` always renders children immediately. Safe because `createEngine` wires up all processors eagerly at construction time. Components use `useValue(engine.core.state)` to know whether audio is running and show UI accordingly.

The `autoStart` prop (default `true`) delegates to [`engine.core.autoStart(document)`](./core.md) — a one-shot gesture listener (`click`/`keydown`/`touchstart`) that calls `engine.core.start()` on the first user interaction. Re-arms automatically if the engine state drops from running (e.g. mobile background suspend).

```typescript
// audio/engine.ts
import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";

export const engine = createEngine((ctx) => {
  const synth = new Synthesizer(ctx);
  synth.output.connect(ctx.destination);
  return { synth };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);

function App() {
  return (
    <EngineProvider>
      <SynthUI />
    </EngineProvider>
  );
}

function SynthUI() {
  const { synth } = useEngine();
  const volume = useValue(synth.volume);
  return (
    <input
      value={volume}
      onChange={(e) => {
        synth.volume.value = +e.target.value;
      }}
    />
  );
}
```
