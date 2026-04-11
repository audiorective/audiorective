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

### `useProcessor(factory, deps)`

Create and manage processor lifecycle. Calls `destroy()` on unmount.

```typescript
const synth = useProcessor(() => new Synthesizer(ctx), [ctx]);
```

---

## Context

### `createProcessorContext<T>()`

Create a typed Provider and hook for passing processors through the component tree.

```typescript
const {
  Provider: SynthProvider,
  useProcessor: useSynth
} = createProcessorContext<Synthesizer>();

function VolumeControl() {
  const synth = useSynth();
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

### `createEngineContext(engine)`

Creates a typed `EngineProvider` and `useEngine` hook for an engine created by `createEngine`. Accepts `T extends { core: AudioEngine }`. Works with React 18 and 19.

`EngineProvider` supports two rendering modes:

- **Suspense mode** (`fallback` provided) — blocks children until `engine.core.start()` is called, shows fallback while waiting
- **Overlay mode** (no `fallback`) — always renders children. Components check `engine.core.state` to show/hide UI. Safe because `createEngine` wires up all processors eagerly at construction time.

The `autoStart` prop registers a one-time gesture listener (`click`/`keydown`/`touchstart`) that calls `engine.core.start()` automatically on the first user interaction. Defaults to `true` in overlay mode (no `fallback`), `false` in Suspense mode.

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

// Suspense mode — explicit start button
function App() {
  return (
    <EngineProvider fallback={<button onClick={() => engine.core.start()}>Start</button>}>
      <SynthUI />
    </EngineProvider>
  );
}

// Overlay mode with autoStart — first click/key anywhere starts audio
function App() {
  return (
    <EngineProvider autoStart>
      <SynthUI />
      <AudioOverlay />
    </EngineProvider>
  );
}

// Components access the typed engine via context — no prop drilling.
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
