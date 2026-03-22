# @audiorective/react

React bindings for audiorective signals.

## Dependencies

```json
{
  "dependencies": {
    "@audiorective/signals": "workspace:*"
  },
  "peerDependencies": {
    "react": "^18.0.0"
  }
}
```

## Package Structure

```
react/src/
├── hooks.ts
├── context.ts
├── types.ts
└── index.ts
```

---

## Hooks

### `useValue(param)`

Subscribe to a parameter's value. Re-renders when the value changes.

```typescript
function useValue<T>(param: Param<T> | SchedulableParam): T {
  const [value, setValue] = useState<T>(() => param.value);

  useEffect(() => {
    const dispose = effect(() => {
      setValue(param.value as T);
    });
    return dispose;
  }, [param]);

  return value;
}
```

### `useComputed(computed)`

Subscribe to a computed value.

```typescript
function useComputed<T>(computed: Computed<T>): T {
  const [value, setValue] = useState<T>(() => computed());

  useEffect(() => {
    const dispose = effect(() => {
      setValue(computed());
    });
    return dispose;
  }, [computed]);

  return value;
}
```

### `useProcessor(factory, deps)`

Create and manage processor lifecycle. Calls `destroy()` on unmount.

```typescript
function useProcessor<T extends AudioProcessor>(factory: () => T, deps: any[] = []): T {
  const processor = useMemo(factory, deps);

  useEffect(() => {
    return () => processor.destroy();
  }, [processor]);

  return processor;
}
```

---

## `createProcessorContext<T>()`

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
      onChange={e => synth.volume.value = +e.target.value}
    />
  );
}

function App() {
  const synth = useProcessor(() => new Synthesizer(new AudioContext()));

  return (
    <SynthProvider processor={synth}>
      <VolumeControl />
    </SynthProvider>
  );
}
```

---

## Usage Example

```typescript
function VolumeSlider({ synth }: { synth: MySynth }) {
  const volume = useValue(synth.volume);

  return (
    <input
      type="range"
      min={synth.volume.min}
      max={synth.volume.max}
      step={synth.volume.precision}
      value={volume}
      onChange={e => synth.volume.value = +e.target.value}
    />
  );
}
```

Direct mutation. No dispatch, no actions. The processor is the source of truth.
