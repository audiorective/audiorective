# @audiorective/react

React hooks and context factories for [@audiorective/core](https://www.npmjs.com/package/@audiorective/core). Direct mutation model — the processor is the source of truth, React just observes.

## Install

```bash
npm install @audiorective/core @audiorective/react
```

Peer dependency: React 18 or 19.

## Hooks

### useValue

Subscribe to a reactive source. Accepts any `Readable<T>` (`Param`, `SchedulableParam`, `Cell`) or a `ComputedAccessor<T>`. Re-renders when the value changes.

```tsx
import { useValue } from "@audiorective/react";

function Display({ synth }) {
  const volume = useValue(synth.volume); // Param<number>
  const pattern = useValue(sequencer.pattern); // Cell<StepPattern>
  const label = useValue(synth.displayLabel); // ComputedAccessor<string>
  return <span>{volume.toFixed(2)}</span>;
}
```

The hook always returns a read-only snapshot. To update state, mutate the source directly:

```tsx
function VolumeSlider({ synth }) {
  const volume = useValue(synth.volume);
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={volume}
      onChange={(e) => {
        synth.volume.value = +e.target.value;
      }}
    />
  );
}
```

Computeds have no setter on the source, so they are read-only by construction — no special hook needed.

## Context

### createEngineContext

Creates a typed `{ EngineProvider, useEngine }` pair for a module-level engine singleton.

```tsx
import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";

const engine = createEngine((ctx) => {
  const synth = new Synth(ctx);
  synth.output.connect(ctx.destination);
  return { synth };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);
```

#### EngineProvider

Always renders children immediately. Safe because `createEngine` wires all processors eagerly at construction time.

`autoStart` (default `true`) registers a one-time gesture listener (`click`/`keydown`/`touchstart`) that calls `engine.core.start()` on first interaction. Re-arms if the engine state drops from running (e.g. mobile background suspend).

```tsx
<EngineProvider>
  <App />
</EngineProvider>
```

Components use `useValue(engine.core.state)` to know whether audio is running and show UI accordingly.

The provider does NOT destroy the engine on unmount — engines are module-level singletons that outlive the component tree.

## Full Example

```tsx
import { useValue } from "@audiorective/react";
import { EngineProvider, useEngine } from "./audio/engine";

function App() {
  return (
    <EngineProvider>
      <Sequencer />
    </EngineProvider>
  );
}

function Sequencer() {
  const { masterSeq } = useEngine();
  const bpm = useValue(masterSeq.bpm);
  const playing = useValue(masterSeq.playing);

  return (
    <div>
      <button onClick={() => (playing ? masterSeq.stop() : masterSeq.start())}>{playing ? "Stop" : "Play"}</button>
      <input
        type="range"
        min={40}
        max={300}
        value={bpm}
        onChange={(e) => {
          masterSeq.bpm.value = +e.target.value;
        }}
      />
    </div>
  );
}
```

## License

MIT — [GitHub](https://github.com/audiorective/audiorective)
