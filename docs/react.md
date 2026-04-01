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

### `useValue(param)`

Subscribe to a parameter's value. Re-renders when the value changes.

```typescript
const volume = useValue(synth.volume); // number
```

### `useComputed(computed)`

Subscribe to a computed value.

```typescript
const label = useComputed(synth.displayLabel); // re-renders on change
```

### `useParam(param)`

Returns a `[value, setValue]` tuple. Combines `useValue` with a stable setter callback, so the setter can be passed directly as an `onChange` handler without inline arrows.

```typescript
const [volume, setVolume] = useParam(synth.volume);

<input value={volume} onChange={e => setVolume(+e.target.value)} />
<ParamSlider value={volume} onChange={setVolume} />
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
  const [volume, setVolume] = useParam(synth.volume);
  return <input value={volume} onChange={e => setVolume(+e.target.value)} />;
}
```

### `createEngineContext(engine)`

Creates a typed `EngineProvider` and `useEngine` hook for an `AudioEngine` singleton. Works with React 18 and 19.

`EngineProvider` supports two rendering modes:

- **Suspense mode** (`fallback` provided) — blocks children until `engine.start()` is called, shows fallback while waiting
- **Overlay mode** (no `fallback`) — always renders children. Components check `engine.state` to show/hide UI. Safe because `createEngine` wires up all processors eagerly at construction time.

The `autoStart` prop registers a one-time gesture listener (`click`/`keydown`/`touchstart`) that calls `engine.start()` automatically on the first user interaction. Defaults to `true` in overlay mode (no `fallback`), `false` in Suspense mode.

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
    <EngineProvider fallback={<button onClick={() => engine.start()}>Start</button>}>
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
  const [volume, setVolume] = useParam(synth.volume);
  return <input value={volume} onChange={e => setVolume(+e.target.value)} />;
}
```
