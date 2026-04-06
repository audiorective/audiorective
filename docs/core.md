# @audiorective/core

Reactive primitives for Web Audio. Bridges audio parameter automation and UI frameworks.

**Powered by alien-signals 3.x** — lightweight, zero-dependency, automatic dependency tracking. Signals use a callable API: `signal()` to read, `signal(value)` to write. Custom types `SignalAccessor<T>` and `ComputedAccessor<T>` are defined in types.ts (alien-signals no longer exports `Signal<T>`, `Effect<T>`, or `Computed<T>`).

Audio state is the single source of truth. UI frameworks observe and mutate directly. No state duplication.

## Quick Start

```typescript
import { AudioProcessor, SchedulableParam } from "@audiorective/core";

class Synth extends AudioProcessor {
  private _gain = new GainNode(this.context);

  readonly volume = this.param({ default: 0.5, bind: this._gain.gain });
  readonly bpm = this.param({ default: 120 });

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  get output() {
    return this._gain;
  }
}

const ctx = new AudioContext();
const synth = new Synth(ctx);
synth.output.connect(ctx.destination);

synth.volume.value = 0.8;
synth.volume.linearRampToValueAtTime(0, ctx.currentTime + 2);
```

## Core Concepts

### The `.value` Pattern

Wraps alien-signals with a `.value` property matching Web Audio API conventions — `gainNode.gain.value = 0.5` and `synth.volume.value = 0.5` are identical patterns. The `$` property exposes the raw `SignalAccessor<T>` (callable: `$()` to read, `$(value)` to write) for framework adapters.

### Parameter Types

Two param types, opt-in scheduling:

- **`Param<T>`** — reactive signal with `.value` getter/setter. The default for all params. Used for BPM, step position, boolean flags, string enums, or any value that's set immediately.
- **`SchedulableParam`** — extends `Param<number>` with Web Audio scheduling methods (`linearRampToValueAtTime`, `setTargetAtTime`, etc.). Created when `bind` returns an `AudioParam` or `schedulable: true` is set.

### When does a param become schedulable?

| Declaration                                           | Result             | Why                                                               |
| ----------------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `this.param({ default: 120 })`                        | `Param<number>`    | Just a reactive number, no scheduling                             |
| `this.param({ default: 0.5, bind: gain.gain })`       | `SchedulableParam` | Bind is an AudioParam instance                                    |
| `this.param({ default: 440, schedulable: true })`     | `SchedulableParam` | No AudioParam bound; uses a phantom ConstantSourceNode internally |
| `this.param({ default: "sine" })`                     | `Param<string>`    | Non-numeric, always plain Param                                   |
| `this.param({ default: "sine", bind: { get, set } })` | `Param<string>`    | Object bind — reactive sync via effect, not scheduling            |

### ParamSync

`ParamSync` keeps the reactive layer in sync with the audio thread. It runs a `requestAnimationFrame` loop that periodically reads `AudioParam.value` back into the signal at a configurable per-param rate (~10 Hz by default).

- Singleton per `AudioContext` via `ParamSync.for(ctx)`
- Auto-starts when the first `SchedulableParam` registers, auto-stops when all unregister
- Each param can have its own `syncInterval` (in milliseconds)

### ConstantSourceNode Scheduling Engine

When `schedulable: true` is set but no `bind` function is provided, `AudioProcessor` internally creates a `ConstantSourceNode` and delegates scheduling to its `offset` AudioParam. This gives sample-accurate scheduling for free, backed by the browser's native automation engine.

**How it works:** The ConstantSourceNode connects through a shared `GainNode(gain=0)` to `ctx.destination`. This keeps the node in an active audio graph (required for automations to evaluate) without producing audible output.

**Why not just disconnect?** A disconnected ConstantSourceNode gets optimized away by the browser — automations stop evaluating and the offset value freezes.

Both scheduling paths (function `bind` and phantom ConstantSourceNode) use the same API and deliver sample-accurate scheduling via native `AudioParam`.

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

Standalone reactive container for structured/complex data. Uses Immer `produce` for ergonomic immutable updates via `.update()`. Not tied to AudioProcessor — usable anywhere. Not auto-discovered by `getParams()`.

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

| Use case                                         | Primitive                    | Why                                                     |
| ------------------------------------------------ | ---------------------------- | ------------------------------------------------------- |
| Numeric audio value, needs ramps/scheduling      | `Param` (via `this.param()`) | Backs an `AudioParam`, auto-discovered by `getParams()` |
| Simple reactive value (BPM, boolean, enum)       | `Param` (via `this.param()`) | Lightweight, auto-discovered                            |
| Structured data (step patterns, presets, config) | `Cell`                       | Immer-based `.update()`, not tied to AudioProcessor     |
| State that doesn't belong to an AudioProcessor   | `Cell`                       | Standalone, usable anywhere                             |

### AudioProcessor (abstract)

Base class for audio processing units. Provides param, computed, and effect factories with lifecycle management.

```typescript
abstract class AudioProcessor {
  readonly context: AudioContext;

  abstract get output(): AudioNode | undefined;

  // param() overloads — bind and schedulable are mutually exclusive:
  protected param<T extends number>(options: { default: T; bind: AudioParam }): SchedulableParam;
  protected param<T extends number>(options: { default: T; schedulable: true }): SchedulableParam;
  protected param<T>(options: { default: T; bind: ParamBind<T> }): Param<T>;
  protected param<T>(options: { default: T }): Param<T>;

  protected computed<T>(fn: () => T): ComputedAccessor<T>;
  protected effect(fn: () => void): () => void;

  getParameter(name: string): Param<unknown> | undefined;
  getState(): ProcessorState;
  setState(state: ProcessorState): void;

  destroy(): void;
}
```

**`destroy()`** stops all effects, calls `destroy()` on all params (cleaning up bind effects and `ParamSync` registrations), and disconnects any internally-created `ConstantSourceNode`s.

### ProcessorState

```typescript
interface ProcessorState {
  version: number;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

---

## Usage Examples

### Basic Processor with AudioParam Binding

```typescript
class GainProcessor extends AudioProcessor {
  private _gain = new GainNode(this.context);

  readonly volume = this.param({ default: 0.5, bind: this._gain.gain });

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  get output() {
    return this._gain;
  }
}

const proc = new GainProcessor(ctx);
proc.output.connect(ctx.destination);

proc.volume.value = 0.8; // immediate
proc.volume.linearRampToValueAtTime(0, ctx.currentTime + 2); // 2s fade out
```

### Virtual Schedulable Param (ConstantSourceNode)

```typescript
class Sequencer extends AudioProcessor {
  // no AudioParam to bind to, but we want sample-accurate scheduling
  readonly intensity = this.param({ default: 0, schedulable: true });

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  get output() {
    return undefined;
  }

  schedulePattern(startTime: number) {
    this.intensity
      .setValueAtTime(0, startTime)
      .linearRampToValueAtTime(1, startTime + 0.5)
      .linearRampToValueAtTime(0, startTime + 1);
  }
}
```

### State Serialization

```typescript
const proc = new GainProcessor(ctx);

// save preset
const preset = proc.getState();
// { version: 1, parameters: { volume: 0.5 } }
localStorage.setItem("preset", JSON.stringify(preset));

// load preset
proc.setState(JSON.parse(localStorage.getItem("preset")!));
```

### Computed Values & Effects

```typescript
class Metronome extends AudioProcessor {
  readonly bpm = this.param({ default: 120 });
  readonly beatDuration = this.computed(() => 60000 / this.bpm.value);

  constructor(ctx: AudioContext) {
    super(ctx);

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
met.bpm.value = 240;
// logs: "Beat duration: 250 ms"
```

### Object Bind (Non-AudioParam Properties)

```typescript
class Synth extends AudioProcessor {
  private osc = new OscillatorNode(this.context);

  readonly waveform = this.param<OscillatorType>({
    default: "sawtooth",
    bind: {
      get: () => this.osc.type,
      set: (v) => {
        this.osc.type = v;
      },
    },
  });

  constructor(ctx: AudioContext) {
    super(ctx);
    this.osc.start();
  }

  get output() {
    return this.osc;
  }
}

const synth = new Synth(ctx);
synth.waveform.value = "square"; // effect pushes to osc.type
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
export type { ParamBind, ParamOptions, ProcessorState, EngineState, Readable, SignalAccessor, ComputedAccessor };
```
