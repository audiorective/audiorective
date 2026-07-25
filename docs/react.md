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

## Owning an AudioContext in a component

Browsers won't let an `AudioContext` make sound until a user gesture, so an app that builds its own context (rather than using `createEngine`'s module-level singleton above) creates it on the first click and tears it down on unmount. The trap is in the teardown.

**Wrong — the cleanup closes the context it just created:**

```tsx
const [machine, setMachine] = useState<DrumMachine | null>(null);
const ctxRef = useRef<AudioContext | null>(null);

useEffect(() => {
  return () => {
    machine?.destroy();
    void ctxRef.current?.close(); // runs on null -> instance, not just unmount
  };
}, [machine]);

function powerOn() {
  const ctx = new AudioContext();
  ctxRef.current = ctx;
  setMachine(new DrumMachine({ audioContext: ctx /* ... */ }));
}
```

When `machine` goes `null → instance`, React runs the _previous_ render's cleanup before the next effect. `machine?.destroy()` is null-safe and no-ops, but `ctxRef.current` is already the live context — so it gets closed immediately.

The symptom is nasty because nothing throws: the clock's ticks keep firing, `state` still reads `"playing"`, and the only tell is that `ctx.currentTime` never advances, so every derived position freezes at its start value.

**Right — context and engine are one state value, torn down together:**

```tsx
const [rig, setRig] = useState<{ ctx: AudioContext; machine: DrumMachine } | null>(null);

useEffect(() => {
  if (!rig) return; // nothing to clean up before power-on
  return () => {
    rig.machine.destroy();
    void rig.ctx.close();
  };
}, [rig]);

function powerOn() {
  const ctx = new AudioContext();
  void ctx.resume();
  setRig({ ctx, machine: new DrumMachine({ audioContext: ctx /* ... */ }) });
}
```

The early `return` means the pre-power-on render registers no cleanup at all, so the only teardown that ever runs is the real one. Keeping the context in state beside the thing that uses it — rather than in a ref the effect can reach across renders — is what makes that possible.

Worked example: `apps/step-sequencer/src/ui/App.tsx`.
