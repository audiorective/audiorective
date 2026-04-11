# @audiorective/core

Reactive primitives for Web Audio. Bridges audio parameter automation and UI frameworks.

**Powered by alien-signals 3.x** — lightweight, zero-dependency, automatic dependency tracking. Signals use a callable API: `signal()` to read, `signal(value)` to write. Custom types `SignalAccessor<T>` and `ComputedAccessor<T>` are defined in types.ts (alien-signals no longer exports `Signal<T>`, `Effect<T>`, or `Computed<T>`).

Audio state is the single source of truth. UI frameworks observe and mutate directly. No state duplication.

## Quick Start

```typescript
import { AudioProcessor, Param, SchedulableParam } from "@audiorective/core";

class Synth extends AudioProcessor<{
  volume: SchedulableParam;
  bpm: Param<number>;
}> {
  private readonly _gain: GainNode;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    super(ctx, ({ param }) => ({
      params: {
        volume: param({ default: 0.5, bind: gain.gain }),
        bpm: param({ default: 120 }),
      },
    }));
    this._gain = gain;
  }

  get output() {
    return this._gain;
  }
}

const ctx = new AudioContext();
const synth = new Synth(ctx);
synth.output.connect(ctx.destination);

synth.params.volume.value = 0.8;
synth.params.volume.linearRampToValueAtTime(0, ctx.currentTime + 2);
```

Subclasses declare their reactive surface as a generic type parameter and build it inside a callback passed to `super()`. The `params` field is a frozen, fully-typed object — `synth.params.volume` resolves to `SchedulableParam` and `synth.params.bpm` to `Param<number>` end-to-end.

**Why a build callback?** Params must be constructed _before_ `super()` returns so that `this.params` is set by the time field initializers and the subclass body run. The base constructor invokes the callback partway through its own setup, exposing helpers (`param`, `schedulableParam`, `cell`) that already have access to the AudioContext and the processor's internal silencer. The callback closes over locals declared before `super()` (audio nodes, etc.), so binding params to `node.frequency` works without `this`.

## Core Concepts

### The `.value` Pattern

Wraps alien-signals with a `.value` property matching Web Audio API conventions — `gainNode.gain.value = 0.5` and `synth.volume.value = 0.5` are identical patterns. The `$` property exposes the raw `SignalAccessor<T>` (callable: `$()` to read, `$(value)` to write) for framework adapters.

### Parameter Types

Two param types, opt-in scheduling:

- **`Param<T>`** — reactive signal with `.value` getter/setter. The default for all params. Used for BPM, step position, boolean flags, string enums, or any value that's set immediately.
- **`SchedulableParam`** — extends `Param<number>` with Web Audio scheduling methods (`linearRampToValueAtTime`, `setTargetAtTime`, etc.). Created when the `param` helper receives `bind: AudioParam`, or via the `schedulableParam` helper.

### When does a param become schedulable?

| Helper call                                      | Result             | Why                                                               |
| ------------------------------------------------ | ------------------ | ----------------------------------------------------------------- |
| `param({ default: 120 })`                        | `Param<number>`    | Just a reactive number, no scheduling                             |
| `param({ default: 0.5, bind: gain.gain })`       | `SchedulableParam` | Bind is an AudioParam instance                                    |
| `schedulableParam({ default: 440 })`             | `SchedulableParam` | No AudioParam bound; uses a phantom ConstantSourceNode internally |
| `param({ default: "sine" })`                     | `Param<string>`    | Non-numeric, always plain Param                                   |
| `param({ default: "sine", bind: { get, set } })` | `Param<string>`    | Object bind — reactive sync via effect, not scheduling            |

### ParamSync

`ParamSync` keeps the reactive layer in sync with the audio thread. It runs a `requestAnimationFrame` loop that periodically reads `AudioParam.value` back into the signal at a configurable per-param rate (~10 Hz by default).

- Singleton per `AudioContext` via `ParamSync.for(ctx)`
- Auto-starts when the first `SchedulableParam` registers, auto-stops when all unregister
- Each param can have its own `syncInterval` (in milliseconds)

### ConstantSourceNode Scheduling Engine

When `schedulableParam` is called without `bind`, `AudioProcessor` internally creates a `ConstantSourceNode` and delegates scheduling to its `offset` AudioParam. This gives sample-accurate scheduling for free, backed by the browser's native automation engine.

**How it works:** The ConstantSourceNode connects through a per-processor `GainNode(gain=0)` (the silencer) to `ctx.destination`. This keeps the node in an active audio graph (required for automations to evaluate) without producing audible output.

**Why not just disconnect?** A disconnected ConstantSourceNode gets optimized away by the browser — automations stop evaluating and the offset value freezes.

Both scheduling paths (`bind: AudioParam` and unbound `schedulableParam`) use the same API and deliver sample-accurate scheduling via native `AudioParam`.

---

## API Reference

### ParamBind\<T\>

```typescript
interface ParamBind<T> {
  get?: () => T; // read from external state
  set?: (value: T) => void; // push to external state (via effect)
}
```

### ParamOptions\<T\>

```typescript
interface ParamOptions<T> {
  default: T;
  bind?: ParamBind<T>;
}
```

### Param\<T\>

Basic reactive parameter for any type. Supports optional `bind` for syncing to external state.

```typescript
class Param<T> implements Readable<T> {
  readonly $: SignalAccessor<T>;
  get value(): T;
  set value(v: T);
  destroy(): void; // stops bind effect (no-op if no bind)
}
```

When `bind.set` is provided, an internal effect pushes value changes to the target. Call `destroy()` to stop it.

### SchedulableParamOptions

```typescript
interface SchedulableParamOptions extends ParamOptions<number> {
  audioParam: AudioParam;
  audioContext: AudioContext;
  syncInterval?: number; // ms, default 100 (~10Hz)
}
```

### SchedulableParam

Numeric parameter with Web Audio scheduling methods. All scheduling methods return `this` for chaining.

```typescript
class SchedulableParam extends Param<number> {
  read(): number; // read directly from AudioParam (realtime)
  syncFromAudio(): void; // pull AudioParam value into signal

  setValueAtTime(value: number, startTime: number): this;
  linearRampToValueAtTime(value: number, endTime: number): this;
  exponentialRampToValueAtTime(value: number, endTime: number): this;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): this;
  cancelScheduledValues(cancelTime: number): this;
  cancelAndHoldAtTime(cancelTime: number): this;

  destroy(): void; // unregisters from ParamSync
}
```

**`read()` vs `.value`:** `.value` returns the signal's last-synced value (updated by `ParamSync` at ~10Hz). `read()` returns the live `AudioParam.value` directly — more accurate during active automations, but doesn't trigger reactive updates.

### ParamSync

```typescript
const DEFAULT_SYNC_INTERVAL_MS = 100; // ~10Hz

class ParamSync {
  static for(ctx: BaseAudioContext): ParamSync; // singleton per context
  register(param: SchedulableParam, intervalMs?: number): void;
  unregister(param: SchedulableParam): void;
  get size(): number;
  get running(): boolean;
}
```

`SchedulableParam` auto-registers/unregisters on construction/destroy — you rarely need to use `ParamSync` directly.

### Readable\<T\>

Shared interface satisfied by both `Param<T>` and `Cell<T>`. Used by React hooks (`useValue`) to accept either.

```typescript
interface Readable<T> {
  readonly $: SignalAccessor<T>;
  readonly value: T;
}
```

### Cell\<T\>

Reactive container for structured/complex data. Uses Immer `produce` for ergonomic immutable updates via `.update()`. Usable standalone, or attached to an `AudioProcessor` via the `cell` build helper, in which case it appears in the processor's `cells` registry.

```typescript
class Cell<T> implements Readable<T> {
  readonly $: SignalAccessor<T>;
  get value(): T;
  set value(v: T);
  update(recipe: (draft: Draft<T>) => void): void;
}

function cell<T>(initial: T): Cell<T>;
```

**Example:**

```typescript
import { cell } from "@audiorective/core";

interface StepPattern {
  steps: boolean[];
  velocity: number[];
}

const pattern = cell<StepPattern>({
  steps: Array(16).fill(false),
  velocity: Array(16).fill(0.8),
});

pattern.update((draft) => {
  draft.steps[0] = true;
  draft.steps[4] = true;
  draft.velocity[4] = 1.0;
});

pattern.value; // { steps: [true, false, false, false, true, ...], velocity: [...] }
```

### Cell vs Param

| Use case                                         | Primitive                                   | Why                                                |
| ------------------------------------------------ | ------------------------------------------- | -------------------------------------------------- |
| Numeric audio value, needs ramps/scheduling      | `Param` (`param`/`schedulableParam` helper) | Backs an `AudioParam`; lives in `processor.params` |
| Simple reactive value (BPM, boolean, enum)       | `Param` (`param` helper)                    | Lightweight; lives in `processor.params`           |
| Structured data (step patterns, presets, config) | `Cell` (`cell` helper or standalone)        | Immer-based `.update()`                            |
| State that doesn't belong to an AudioProcessor   | `Cell` (standalone)                         | Usable anywhere                                    |

### AudioProcessor (abstract)

Base class for audio processing units. Generic over the param and cell registries it exposes. Subclasses pass a build callback to `super()` that returns those registries.

```typescript
abstract class AudioProcessor<
  P extends Record<string, Param<any>> = Record<string, Param<any>>,
  C extends Record<string, Cell<any>> = Record<string, Cell<any>>,
> {
  readonly context: AudioContext;
  readonly params: Readonly<P>; // frozen, fully typed
  readonly cells: Readonly<C>; // frozen, fully typed

  protected constructor(context: AudioContext, build: (helpers: BuildHelpers) => { params?: P; cells?: C });

  abstract get output(): AudioNode | undefined;

  protected computed<T>(fn: () => T): ComputedAccessor<T>;
  protected effect(fn: () => void): () => void;

  destroy(): void;
}

interface BuildHelpers {
  // overloads — `bind: AudioParam` upgrades to SchedulableParam
  param<T extends number>(opts: Omit<ParamOptions<T>, "bind"> & { bind: AudioParam }): SchedulableParam;
  param<T>(opts: ParamOptions<T> & { bind: ParamBind<T> }): Param<T>;
  param<T>(opts: ParamOptions<T>): Param<T>;
  schedulableParam(opts: Omit<ParamOptions<number>, "bind"> & { bind?: AudioParam }): SchedulableParam;
  cell<T>(initial: T): Cell<T>;
}
```

**`destroy()`** stops all effects, calls `destroy()` on every param in the registry (cleaning up bind effects and `ParamSync` registrations), and disconnects any internally-created `ConstantSourceNode`s. Cells are not destroyed automatically — they're plain reactive containers with no audio-graph resources.

---

## Usage Examples

### Basic Processor with AudioParam Binding

```typescript
class GainProcessor extends AudioProcessor<{ volume: SchedulableParam }> {
  private readonly _gain: GainNode;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    super(ctx, ({ param }) => ({
      params: { volume: param({ default: 0.5, bind: gain.gain }) },
    }));
    this._gain = gain;
  }

  get output() {
    return this._gain;
  }
}

const proc = new GainProcessor(ctx);
proc.output.connect(ctx.destination);

proc.params.volume.value = 0.8; // immediate
proc.params.volume.linearRampToValueAtTime(0, ctx.currentTime + 2); // 2s fade out
```

### Virtual Schedulable Param (ConstantSourceNode)

```typescript
class Sequencer extends AudioProcessor<{ intensity: SchedulableParam }> {
  constructor(ctx: AudioContext) {
    super(ctx, ({ schedulableParam }) => ({
      // no AudioParam to bind to, but we want sample-accurate scheduling
      params: { intensity: schedulableParam({ default: 0 }) },
    }));
  }

  get output() {
    return undefined;
  }

  schedulePattern(startTime: number) {
    this.params.intensity
      .setValueAtTime(0, startTime)
      .linearRampToValueAtTime(1, startTime + 0.5)
      .linearRampToValueAtTime(0, startTime + 1);
  }
}
```

### Computed Values & Effects

`computed()` and `effect()` remain instance methods. They run after `super()` returns, so they can read `this.params` directly:

```typescript
class Metronome extends AudioProcessor<{ bpm: Param<number> }> {
  readonly beatDuration: () => number;

  constructor(ctx: AudioContext) {
    super(ctx, ({ param }) => ({
      params: { bpm: param({ default: 120 }) },
    }));

    this.beatDuration = this.computed(() => 60000 / this.params.bpm.value);

    this.effect(() => {
      console.log("Beat duration:", this.beatDuration(), "ms");
    });
  }

  get output() {
    return undefined;
  }
}

const met = new Metronome(ctx);
// logs: "Beat duration: 500 ms"
met.params.bpm.value = 240;
// logs: "Beat duration: 250 ms"
```

### Object Bind (Non-AudioParam Properties)

```typescript
class Synth extends AudioProcessor<{ waveform: Param<OscillatorType> }> {
  private readonly osc: OscillatorNode;

  constructor(ctx: AudioContext) {
    const osc = new OscillatorNode(ctx);
    super(ctx, ({ param }) => ({
      params: {
        waveform: param<OscillatorType>({
          default: "sawtooth",
          bind: {
            get: () => osc.type,
            set: (v) => {
              osc.type = v;
            },
          },
        }),
      },
    }));
    this.osc = osc;
    this.osc.start();
  }

  get output() {
    return this.osc;
  }
}

const synth = new Synth(ctx);
synth.params.waveform.value = "square"; // effect pushes to osc.type
```

### Standalone Params (Outside AudioProcessor)

```typescript
import { Param, SchedulableParam } from "@audiorective/core";

// simple reactive value
const isPlaying = new Param({ default: false });
isPlaying.value = true;

// param with bind — syncs to external state
const osc = new OscillatorNode(ctx);
const waveform = new Param<OscillatorType>({
  default: "sine",
  bind: {
    set: (v) => {
      osc.type = v;
    },
  },
});
waveform.value = "square"; // pushes to osc.type
waveform.destroy(); // cleanup

// schedulable param bound to an existing AudioParam
const gain = new GainNode(ctx);
const vol = new SchedulableParam({
  default: 0.5,
  audioContext: ctx,
  audioParam: gain.gain,
});
vol.linearRampToValueAtTime(0, ctx.currentTime + 1);
vol.destroy(); // cleanup when done
```

---

## AudioEngine

### Lifecycle

`AudioEngine` manages the top-level audio system lifecycle. The `AudioContext` is created eagerly at construction time (browser suspends it automatically via autoplay policy). Processors are registered via `register()` and wired up in the `createEngine` setup callback.

```
createEngine() / new Engine()  →  context created (suspended)               →  'idle'
.core.start()                  →  context.resume() (needs user gesture)      →  'running'
.core.suspend()                →  context.suspend()                          →  'suspended'
.core.resume()                 →  context.resume()                           →  'running'
.core.destroy()                →  processors destroyed, context closed       →  'destroyed' (terminal)
```

Calling `.core.start()` on a destroyed engine throws. Calling `.core.suspend()`/`.core.resume()` on a destroyed engine warns and no-ops.

### EngineState

```typescript
type EngineState = "idle" | "running" | "suspended" | "destroyed";
```

### AudioEngine

```typescript
class AudioEngine {
  constructor(existingContext?: AudioContext);

  get context(): AudioContext;
  get state(): SignalAccessor<EngineState>;
  untilReady(): Promise<void>; // resolves when state becomes 'running'

  start(): Promise<void>; // context.resume(), requires user gesture
  suspend(): Promise<void>;
  resume(): Promise<void>;
  destroy(): void; // terminal — cannot restart

  register<T extends AudioProcessor>(processor: T): T;
}
```

### `createEngine(setup, options?)`

Vue setup-style factory that replaces subclassing for the common case. User-defined properties are top-level; engine lifecycle is accessed via `.core`.

```typescript
function createEngine<T extends Record<string, unknown>>(
  setup: (context: AudioContext) => T,
  options?: { context?: AudioContext },
): T & { core: AudioEngine };
```

Auto-registers all `AudioProcessor` instances from the returned object. Only one reserved key: `"core"` — using it in the returned object is a compile-time type error and a runtime throw.

```typescript
const engine = createEngine((ctx) => {
  const synth = new Synth(ctx);
  synth.output.connect(ctx.destination);
  const sequencer = new Sequencer(synth, ctx);
  return { synth, sequencer };
});

engine.synth; // Synth — fully typed, no ! assertion
engine.sequencer; // Sequencer
engine.core.start(); // resume AudioContext
engine.core.state(); // EngineState
engine.core.destroy(); // cleanup
engine.core.context; // AudioContext
```

---

## Package Structure

```
signals/src/
├── AudioEngine.ts       # engine lifecycle + createEngine factory
├── AudioProcessor.ts    # base class with param/computed/effect factories
├── Cell.ts              # reactive container for structured data (Immer-based)
├── Param.ts             # reactive parameter wrapper
├── SchedulableParam.ts  # numeric param with Web Audio scheduling
├── ParamSync.ts         # per-context RAF sync loop
├── types.ts             # SignalAccessor, ComputedAccessor, Readable, ParamBind, etc.
└── index.ts             # public exports
```

## Exports

```typescript
// Classes
export { Param, SchedulableParam, ParamSync, AudioProcessor, AudioEngine, Cell };

// Factories
export { createEngine, cell };

// Constants
export { DEFAULT_SYNC_INTERVAL_MS };

// Types
export type { ParamBind, ParamOptions, EngineState, Readable, SignalAccessor, ComputedAccessor, BuildHelpers, BuildResult };
```
