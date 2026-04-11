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

### useProcessor

Create and manage an AudioProcessor's lifecycle. Destroys and recreates when deps change. Cleans up on unmount.

```tsx
import { useProcessor } from "@audiorective/react";

function SynthPanel({ ctx }) {
  const synth = useProcessor(() => new Synth(ctx), [ctx]);
  const freq = useValue(synth.frequency);
  // ...
}
```

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

#### EngineProvider modes

**Suspense mode** — pass `fallback` to block children until the engine starts. A gesture listener calls `engine.start()` on first click/keydown/touch.

```tsx
<EngineProvider fallback={<p>Click anywhere to start</p>}>
  <App />
</EngineProvider>
```

**Overlay mode** — omit `fallback` to render children immediately. Safe because `createEngine` wires all processors eagerly. `autoStart` defaults to `true`.

```tsx
<EngineProvider>
  <App />
</EngineProvider>
```

The provider does NOT destroy the engine on unmount — engines are module-level singletons that outlive the component tree.

### createProcessorContext

Creates a typed context for passing a processor through the component tree.

```tsx
const { Provider: SynthProvider, useProcessor: useSynth } = createProcessorContext<Synth>();

<SynthProvider value={synth}>
  <SynthControls />
</SynthProvider>;

function SynthControls() {
  const synth = useSynth();
  const cutoff = useValue(synth.cutoff);
  return (
    <input
      type="range"
      value={cutoff}
      onChange={(e) => {
        synth.cutoff.value = +e.target.value;
      }}
    />
  );
}
```

## Full Example

```tsx
import { useValue } from "@audiorective/react";
import { EngineProvider, useEngine } from "./audio/engine";

function App() {
  return (
    <EngineProvider fallback={<p>Click to start</p>}>
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
