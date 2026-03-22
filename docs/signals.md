# @audiorective/signals

Reactive primitives for Web Audio. Bridges audio parameter automation and UI frameworks.

**Powered by alien-signals** — lightweight, zero-dependency, automatic dependency tracking.

Audio state is the single source of truth. UI frameworks observe and mutate directly. No state duplication.

## Quick Start

```typescript
import { AudioProcessor, SchedulableParam } from "@audiorective/signals";

class Synth extends AudioProcessor {
  private _gain = new GainNode(this.context);

  readonly volume = this.param({ default: 0.5, audioParam: this._gain.gain });
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

Wraps alien-signals with a `.value` property matching Web Audio API conventions — `gainNode.gain.value = 0.5` and `synth.volume.value = 0.5` are identical patterns. The `$` property exposes the raw signal for framework adapters.

### Parameter Types

Two param types, opt-in scheduling:

- **`Param<T>`** — reactive signal with `.value` getter/setter. The default for all params. Used for BPM, step position, boolean flags, string enums, or any value that's set immediately.
- **`SchedulableParam`** — extends `Param<number>` with Web Audio scheduling methods (`linearRampToValueAtTime`, `setTargetAtTime`, etc.). Created only when an `audioParam` is provided or `schedulable: true` is set.

### When does a param become schedulable?

| Declaration                                           | Result             | Why                                                               |
| ----------------------------------------------------- | ------------------ | ----------------------------------------------------------------- |
| `this.param({ default: 120 })`                        | `Param<number>`    | Just a reactive number, no scheduling                             |
| `this.param({ default: 0.5, audioParam: gain.gain })` | `SchedulableParam` | Bound to a real AudioParam                                        |
| `this.param({ default: 440, schedulable: true })`     | `SchedulableParam` | No AudioParam bound; uses a phantom ConstantSourceNode internally |
| `this.param({ default: "sine" })`                     | `Param<string>`    | Non-numeric, always plain Param                                   |

### ParamSync

`ParamSync` keeps the reactive layer in sync with the audio thread. It runs a `requestAnimationFrame` loop that periodically reads `AudioParam.value` back into the signal at a configurable per-param rate (~10 Hz by default).

- Singleton per `AudioContext` via `ParamSync.for(ctx)`
- Auto-starts when the first `SchedulableParam` registers, auto-stops when all unregister
- Each param can have its own `syncInterval` (in milliseconds)

### ConstantSourceNode Scheduling Engine

When `schedulable: true` is set but no `audioParam` is provided, `AudioProcessor` internally creates a `ConstantSourceNode` and delegates scheduling to its `offset` AudioParam. This gives sample-accurate scheduling for free, backed by the browser's native automation engine.

**How it works:** The ConstantSourceNode connects through a shared `GainNode(gain=0)` to `ctx.destination`. This keeps the node in an active audio graph (required for automations to evaluate) without producing audible output.

**Why not just disconnect?** A disconnected ConstantSourceNode gets optimized away by the browser — automations stop evaluating and the offset value freezes.

Both scheduling paths (explicit `audioParam` and phantom ConstantSourceNode) use the same API and deliver sample-accurate scheduling via native `AudioParam`.

---

## API Reference

### ParamOptions\<T\>

```typescript
interface ParamOptions<T> {
  default: T;
}
```

### Param\<T\>

Basic reactive parameter for any type.

```typescript
class Param<T> {
  readonly $: Signal<T>; // raw alien-signals signal
  get value(): T;
  set value(v: T);
}
```

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

### AudioProcessor (abstract)

Base class for audio processing units. Provides param, computed, and effect factories with lifecycle management.

```typescript
abstract class AudioProcessor {
  readonly context: AudioContext;

  abstract get output(): AudioNode | undefined;

  // param() overloads:
  protected param<T extends number>(options: ParamOptions<T> & { schedulable: true }): SchedulableParam;
  protected param<T extends number>(options: ParamOptions<T> & { audioParam: AudioParam }): SchedulableParam;
  protected param<T>(options: ParamOptions<T>): Param<T>;

  protected computed<T>(fn: () => T): Computed<T>;
  protected effect(fn: () => void): Effect<void>;

  getParameter(name: string): Param<unknown> | undefined;
  getState(): ProcessorState;
  setState(state: ProcessorState): void;

  destroy(): void;
}
```

**`destroy()`** stops all effects, unregisters all `SchedulableParam`s from `ParamSync`, and disconnects any internally-created `ConstantSourceNode`s.

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

  readonly volume = this.param({ default: 0.5, audioParam: this._gain.gain });

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
  readonly beatDuration = this["computed"](() => 60000 / this.bpm.value);

  constructor(ctx: AudioContext) {
    super(ctx);

    this.effect(() => {
      console.log("Beat duration:", this.beatDuration.get(), "ms");
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

### Standalone Params (Outside AudioProcessor)

```typescript
import { Param, SchedulableParam } from "@audiorective/signals";

// simple reactive value
const isPlaying = new Param({ default: false });
isPlaying.value = true;

// schedulable param bound to an existing AudioParam
const ctx = new AudioContext();
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

## Package Structure

```
signals/src/
├── AudioProcessor.ts    # base class with param/computed/effect factories
├── Param.ts             # reactive parameter wrapper
├── SchedulableParam.ts  # numeric param with Web Audio scheduling
├── ParamSync.ts         # per-context RAF sync loop
├── types.ts             # ParamOptions, ProcessorState
└── index.ts             # public exports
```

## Exports

```typescript
// Classes
export { Param, SchedulableParam, ParamSync, AudioProcessor };

// Constants
export { DEFAULT_SYNC_INTERVAL_MS };

// Types
export type { ParamOptions, ProcessorState, Computed };
```
