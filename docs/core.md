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
  rebind(audioParam: AudioParam, opts?: { reassert?: boolean }): void; // re-point at a new AudioParam

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

**`rebind()`:** re-points the param at a different `AudioParam`, keeping the same `SchedulableParam` instance (and its reactive `.value`/`$` surface). For sources whose node is recreated on each restart — an `AudioBufferSourceNode` is one-shot, so each `start()` makes a fresh `playbackRate`. `ParamSync` is keyed on the param, not the AudioParam, so `read()`/`syncFromAudio()` follow automatically with no re-registration; automation queued on the old (dead) node is gone, which is the desired semantics. `reassert` (default `true`) mirrors the current value onto the new param. Used internally by `BufferPlayer`.

### Automation Gotchas

- Always anchor with `setValueAtTime(currentValue, now)` before any ramp — otherwise the ramp starts from whatever value the AudioParam holds at the _previous_ scheduled point, not "now".
- Call `cancelScheduledValues(now)` before starting a new automation sequence if previous automations may still be queued.
- Don't bind a volume `Param` directly to an envelope gain node — use a separate gain. Otherwise envelope writes and volume writes fight for the same `AudioParam`.

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
  get input(): AudioNode | undefined; // default: undefined

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

**Effects vs instruments — the `.input` convention.** A processor that **transforms** incoming audio (EQ, compressor, reverb, distortion) declares both `input` and `output`. A processor that **produces** audio from scratch (synth, sampler, oscillator) declares only `output`; `input` returns `undefined` from the base class. There are no `EffectProcessor`/`InstrumentProcessor` subclasses — the convention is purely about which getters a processor exposes. Downstream code that needs to insert a processor as an effect (e.g. `bindEffect` in `@audiorective/playcanvas`) checks `processor.input !== undefined`. Spatial's `input` getter is the prototype: it returns the entry `GainNode` that connects into the underlying `PannerNode`.

### Spatial

Built-in `AudioProcessor` that owns a `PannerNode` (HRTF) and exposes its seven properties as reactive `Param<T>`s. Lives in core — audio works end-to-end without any 3D renderer. `@audiorective/threejs` provides `PannerAnchor` to bind a scene `Object3D`'s world transform to the panner.

```typescript
import { Spatial, type SpatialOptions } from "@audiorective/core";

class Spatial extends AudioProcessor<{
  refDistance: Param<number>;
  maxDistance: Param<number>;
  rolloffFactor: Param<number>;
  distanceModel: Param<DistanceModelType>;
  coneInnerAngle: Param<number>;
  coneOuterAngle: Param<number>;
  coneOuterGain: Param<number>;
}> {
  readonly panner: PannerNode;
  override get input(): GainNode; // entry gain feeding the panner
  get output(): AudioNode; // returns panner

  constructor(context: AudioContext, options?: SpatialOptions);
}

interface SpatialOptions {
  distanceModel?: DistanceModelType; // default "inverse"
  refDistance?: number; // default 1
  maxDistance?: number; // default 10000
  rolloffFactor?: number; // default 1
  coneInnerAngle?: number; // default 360
  coneOuterAngle?: number; // default 0
  coneOuterGain?: number; // default 0
}
```

Feed audio into `spatial.input` (a `GainNode`) and connect `spatial.output` to `ctx.destination` (or further). Writing to any of the seven `Param<T>`s propagates to the underlying `PannerNode` via a bind effect.

```typescript
const synth = new MySynth(ctx);
const spatial = new Spatial(ctx, { distanceModel: "inverse", refDistance: 2 });
synth.output.connect(spatial.input);
spatial.output.connect(ctx.destination);

spatial.params.maxDistance.value = 500;
spatial.params.rolloffFactor.value = 0.5;
```

Position/orientation are plain `AudioParam`s on `spatial.panner`. Drive them directly from a render loop, or hand `spatial.panner` to `PannerAnchor` in `@audiorective/threejs` for automatic world-transform sync.

---

### Analyser

Built-in `AudioProcessor` that owns an `AnalyserNode` as a **pass-through tap** — wire it inline (`source → analyser.input`, `analyser.output → destination`) and read the realtime spectrum or waveform. The primitive every visualizer needs, so you don't hand-roll an `AnalyserNode` + byte buffer each time.

```typescript
import { Analyser, type AnalyserOptions } from "@audiorective/core";

class Analyser extends AudioProcessor {
  readonly node: AnalyserNode;
  override get input(): AudioNode; // === output; the pass-through node
  get output(): AudioNode;
  get binCount(): number; // fftSize / 2 — length of a frequency buffer
  get fftSize(): number; // length of a waveform buffer

  createFrequencyBuffer(): Uint8Array; // sized to binCount
  createWaveformBuffer(): Uint8Array; // sized to fftSize
  readFrequencies(out: Uint8Array): void; // 0–255 per bin (getByteFrequencyData)
  readWaveform(out: Uint8Array): void; // 0–255, 128 = silence (getByteTimeDomainData)

  constructor(context: AudioContext, options?: AnalyserOptions);
}

interface AnalyserOptions {
  fftSize?: number; // default 2048
  smoothingTimeConstant?: number; // default 0.8
  minDecibels?: number;
  maxDecibels?: number;
}
```

```typescript
const analyser = new Analyser(ctx, { fftSize: 256 });
synth.output.connect(analyser.input);
analyser.output.connect(ctx.destination);

const bins = analyser.createFrequencyBuffer();
// each render frame (ticker / requestAnimationFrame / useFrame):
analyser.readFrequencies(bins); // bins[i] = 0–255
```

**Analyser data is not reactive** — it changes every audio frame with no signal to subscribe to. Poll it from your render loop, **not** from an `effect()` or `useValue()`. See [pixijs.md](./pixijs.md) for the `effect`-vs-render-loop decision in a full app.

---

## Sound Playback

Three primitives cover audio playback. They split on two axes — **source** (in-memory `AudioBuffer` vs streamed file) and **voice model** (polyphonic vs single playhead). For a how-to-choose walkthrough see `choosing-playback.md`.

|               | `Sampler`                         | `BufferPlayer`                                | `FilePlayer`                                         |
| ------------- | --------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| **Metaphor**  | Drum pad / sampler                | Deck / tape loop                              | Transport / track                                    |
| **Source**    | `AudioBuffer` (in memory)         | `AudioBuffer` (in memory)                     | `HTMLAudioElement` (streams; no decode)              |
| **Voices**    | Polyphonic — `trigger()` overlaps | Single persistent playhead                    | Single playhead                                      |
| **Clock**     | sample-accurate (ctx)             | sample-accurate (ctx)                         | media clock                                          |
| **Transport** | none (fire-and-forget voices)     | `start`/`stop`/loop, **schedulable `rate`**   | `play`/`pause`/`seek`/`stop`                         |
| **Good for**  | SFX, one-shots, hits              | beat-locked loops/stems, DJ pitch/tempo moves | music, long-form, scrubbing                          |
| **API entry** | `player.trigger()`                | `player.start()` / `player.stop()`            | `player.play()` / `player.pause()` / `player.seek()` |

All three are output-only `AudioProcessor`s. Compose them by routing `player.output` through `Spatial`, an EQ, or directly to `ctx.destination`.

### `loadAudioBuffer` / `AudioBufferCache`

Before a `Sampler` can play anything it needs an `AudioBuffer`. Two helpers handle fetching and decoding:

```typescript
import { loadAudioBuffer, AudioBufferCache } from "@audiorective/core";

// one-shot fetch + decode
const buffer = await loadAudioBuffer(ctx, "/sounds/snare.wav");

// cached — dedupes concurrent loads, evicts on failure
const cache = new AudioBufferCache(ctx);
const [kick, snare] = await Promise.all([cache.load("/sounds/kick.wav"), cache.load("/sounds/snare.wav")]);
cache.clear(); // drop all cached entries
```

`AudioBufferCache.load()` is safe to call multiple times with the same URL — concurrent callers share the in-flight request and receive the same resolved `AudioBuffer`.

### Sampler

Buffer-backed polyphonic player. Each `trigger()` call spawns a voice; voices overlap according to the `polyphony` cap and `steal` policy. No transport or playhead — pure fire-and-forget (or fire-and-control via the returned `Voice` handle).

```typescript
import { Sampler, AudioBufferCache } from "@audiorective/core";

const cache = new AudioBufferCache(ctx);
const player = new Sampler(ctx, { polyphony: 4, loop: false });
player.output.connect(ctx.destination);

player.buffer = await cache.load("/sounds/kick.wav");

// fire a voice
const voice = player.trigger();

// per-voice control
const voice2 = player.trigger({ volume: 0.5, rate: 1.2 });
voice2.stop();

// silence everything
player.stopAll();
player.destroy();
```

**Constructor options** (`SamplerOptions`):

| Option         | Type                  | Default    | Description                                    |
| -------------- | --------------------- | ---------- | ---------------------------------------------- |
| `buffer`       | `AudioBuffer \| null` | `null`     | Initial buffer (hot-swappable via `.buffer =`) |
| `loop`         | `boolean`             | `false`    | Loop voices by default                         |
| `playbackRate` | `number`              | `1`        | Default playback rate                          |
| `volume`       | `number`              | `1`        | Output gain 0–1                                |
| `polyphony`    | `number`              | `1`        | Maximum simultaneous voices                    |
| `steal`        | `"oldest" \| "none"`  | `"oldest"` | What happens when `polyphony` is exceeded      |

**Polyphony / steal matrix:**

| `polyphony` | `steal`    | Behaviour                                                         |
| ----------- | ---------- | ----------------------------------------------------------------- |
| `1`         | `"oldest"` | Each `trigger()` restarts — classic one-shot pad                  |
| `1`         | `"none"`   | First voice plays to completion; retriggering is silently dropped |
| `N`         | `"oldest"` | Up to N overlapping voices; oldest stolen when cap hit            |
| `N`         | `"none"`   | Up to N overlapping voices; excess triggers dropped               |

**Public surface:**

```typescript
player.buffer: AudioBuffer | null      // hot-swap at any time
player.output: AudioNode               // summing gain; connect → Spatial / destination
player.params.volume: SchedulableParam // output gain 0..1
player.cells.activeVoices: Cell<number>// reactive voice count

player.trigger(opts?: TriggerOptions): Voice | null
// Returns null when no buffer is set, or steal:"none" drops the voice.
player.stopAll(when?: number): void
player.destroy(): void
```

**`TriggerOptions`** (all optional):

```typescript
interface TriggerOptions {
  offset?: number; // start position in seconds (default 0)
  duration?: number; // max play time; omit to play to end / loop
  when?: number; // AudioContext time to start (default: now)
  rate?: number; // playback rate override
  volume?: number; // per-voice gain override
  loop?: boolean; // per-voice loop override
}
```

### Voice

`trigger()` returns a `Voice` — a per-voice handle for real-time control. You never construct `Voice` directly.

```typescript
const voice = player.trigger({ volume: 0.8 });

voice.stop(); // stop now (or schedule: voice.stop(ctx.currentTime + 2))
voice.pause();
voice.resume();
voice.seek(1.5); // jump to 1.5 s
voice.currentTime; // current position (loop-aware)
voice.duration; // buffer duration in seconds
voice.isPlaying; // boolean
voice.volume = 0.5; // live gain change
voice.rate = 0.75; // live rate change
voice.onEnded(() => console.log("done")); // fires once on natural end or stop()
```

### BufferPlayer

Buffer-backed **single-playhead transport** — the "deck". One persistent source you `start()`, `stop()`, and loop on the sample-accurate AudioContext clock. Where `Sampler` fires throwaway voices, `BufferPlayer` keeps its source alive for the whole play session, so its **`rate` is a real schedulable `AudioParam`** — ramp it for tempo/pitch moves (vinyl spin-down, tempo-match). Use it for beat-locked loops and stems; use `Sampler` for SFX, `FilePlayer` for streamed long-form.

```typescript
import { BufferPlayer, AudioBufferCache } from "@audiorective/core";

const cache = new AudioBufferCache(ctx);
const deck = new BufferPlayer(ctx, { loop: true, loopEnd: 3.69 }); // loopEnd = musical length, guards opus decode tail
deck.output.connect(ctx.destination);
deck.buffer = await cache.load("/loops/break.opus");

deck.start(ctx.currentTime + 0.1); // sample-accurate, phase-locked to a shared t0
deck.params.volume.linearRampToValueAtTime(0, ctx.currentTime + 2);

// DJ spin-down — schedule on the live source's playbackRate
const at = ctx.currentTime;
deck.params.rate
  .cancelScheduledValues(at)
  .setValueAtTime(deck.params.rate.read(), at)
  .exponentialRampToValueAtTime(0.04, at + 1.3);
```

**Constructor options** (`BufferPlayerOptions`):

| Option         | Type                  | Default | Description                                                                              |
| -------------- | --------------------- | ------- | ---------------------------------------------------------------------------------------- |
| `buffer`       | `AudioBuffer \| null` | `null`  | Initial buffer (hot-swappable via `.buffer =`, applies next `start()`)                   |
| `loop`         | `boolean`             | `false` | Loop the buffer                                                                          |
| `loopStart`    | `number`              | `0`     | Loop start (seconds)                                                                     |
| `loopEnd`      | `number`              | `0`     | Loop end (seconds); `0` → buffer end. Set it for musical-loop length / decode-tail guard |
| `playbackRate` | `number`              | `1`     | Starting rate; also the rate a restart re-anchors to                                     |
| `volume`       | `number`              | `1`     | Output gain 0–1                                                                          |

**Public surface:**

```typescript
player.buffer: AudioBuffer | null      // hot-swap; takes effect on next start()
player.output: AudioNode               // output gain; connect → Spatial / EQ / destination
player.params.volume: SchedulableParam // output gain 0..1
player.params.rate: SchedulableParam   // playback rate — schedulable (the point of this primitive)
player.cells.isPlaying: Cell<boolean>

player.start(when?: number, offset?: number): void  // sample-accurate; no-op while playing or with no buffer
player.stop(when?: number): void                     // immediate, or future-dated (plays until `when`)
player.loop = true; player.loopStart = 0; player.loopEnd = 3.69;  // setters write through to the live source
player.destroy(): void
```

**Why `rate` is schedulable but the others aren't special.** An `AudioBufferSourceNode` is one-shot — `stop()` permanently kills it, so each `start()` builds a fresh node with a fresh `playbackRate`. `BufferPlayer` keeps `params.rate` a **stable reference** (so `useValue(player.rate)` gives a live pitch readout) and re-points it at the new node's `playbackRate` via [`SchedulableParam.rebind`](#schedulableparam) on every `start()`. Consequences:

- Scheduled rate automation belongs to the **current play session**. `stop()` ends it; the next `start()` re-anchors to the base rate (no stale spin-down carries over).
- `params.volume` binds once to the persistent output gain — it never rebinds, and fades just work across starts.
- `read()` returns the live `playbackRate` during an automation; `.value` returns the last `ParamSync`-sampled value (~10 Hz).

A phase-locked multi-stem "instrument" (e.g. a beat made of layered loops) is **N `BufferPlayer`s** sharing one `start(t0)` and ramped together — the library primitive stays one buffer; the layering is composition.

### FilePlayer

Streaming track player backed by `HTMLAudioElement`. Suitable for music and long-form audio where fully decoding into an `AudioBuffer` would be prohibitive. Has a single playhead; use `Sampler` when you need polyphony.

```typescript
import { FilePlayer } from "@audiorective/core";

const player = new FilePlayer(ctx, { src: "/music/track.mp3", volume: 0.8 });
player.output.connect(ctx.destination);

await player.play(); // also resumes after pause
player.pause();
player.seek(30); // jump to 30 s
player.stop(); // pause + rewind to 0

player.src = "/music/other.mp3"; // swap track; resets currentTime / duration

player.onEnded(() => console.log("track finished")); // natural end only

player.destroy();
```

**Constructor options** (`FilePlayerOptions`):

| Option         | Type                         | Default       | Description                         |
| -------------- | ---------------------------- | ------------- | ----------------------------------- |
| `src`          | `string`                     | —             | Initial source URL                  |
| `loop`         | `boolean`                    | `false`       | Loop playback                       |
| `volume`       | `number`                     | `1`           | Output gain 0–1                     |
| `playbackRate` | `number`                     | `1`           | Playback rate                       |
| `crossOrigin`  | `string \| null`             | `"anonymous"` | CORS attribute on the audio element |
| `preload`      | `"none"\|"metadata"\|"auto"` | `"metadata"`  | `<audio>` preload hint              |

**Public surface:**

```typescript
player.audio: HTMLAudioElement         // escape hatch for direct DOM access
player.output: AudioNode               // MediaElementSource → connect here
player.src: string | null              // getter/setter; setter loads + resets state
player.params.volume: SchedulableParam
player.cells.isPlaying: Cell<boolean>
player.cells.currentTime: Cell<number>
player.cells.duration: Cell<number>    // NaN until loadedmetadata fires

// setters
player.loop = true;
player.playbackRate = 1.5;

player.play(): Promise<void>   // swallows autoplay-gesture + AbortError
player.pause(): void
player.seek(t: number): void
player.stop(): void            // pause + seek(0)
player.onEnded(cb: () => void): void
player.destroy(): void
```

**`play()` swallows two error classes silently:** autoplay-gesture errors (browser blocked playback before a user gesture) and `AbortError` (the element was replaced or unloaded mid-play). Surface-level calls remain fire-and-forget for the common case; gate on `player.cells.isPlaying` to react to actual state.

```typescript
// React example — bind transport cells to UI
const isPlaying = useValue(player.cells.isPlaying);
const currentTime = useValue(player.cells.currentTime);
const duration = useValue(player.cells.duration);
```

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

  autoStart(
    target: EventTarget,
    options?: { events?: readonly string[] }, // default: ["click", "keydown", "touchstart"]
  ): () => void; // returns a detach function
}
```

### `autoStart(target, options?)`

Arms one-shot gesture listeners on `target` that call `start()` on the first user interaction. Re-arms automatically if the engine state later drops from `running` (e.g. mobile background suspend). Disarms permanently when the engine is destroyed. Returns a detach function that stops the effect and removes any armed listeners.

This is the engine-side primitive used by `@audiorective/react`'s `EngineProvider` and `@audiorective/threejs`'s `attach()`. Use it directly in frameworks without a wrapper.

```typescript
// Vanilla
const detach = engine.core.autoStart(document);
// ...later
detach();

// Custom events
engine.core.autoStart(canvas, { events: ["pointerdown"] });
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
├── Spatial.ts           # AudioProcessor wrapping a PannerNode
├── Analyser.ts          # AudioProcessor wrapping an AnalyserNode (spectrum/waveform tap)
├── types.ts             # SignalAccessor, ComputedAccessor, Readable, ParamBind, etc.
└── index.ts             # public exports
```

## Exports

```typescript
// Classes
export { Param, SchedulableParam, ParamSync, AudioProcessor, AudioEngine, Cell, Spatial, Analyser };
export { Sampler, BufferPlayer, FilePlayer, Voice };
export { AudioBufferCache };

// Factories
export { createEngine, cell };
export { loadAudioBuffer };

// Constants
export { DEFAULT_SYNC_INTERVAL_MS };

// Types
export type {
  ParamBind,
  ParamOptions,
  EngineState,
  Readable,
  SignalAccessor,
  ComputedAccessor,
  BuildHelpers,
  BuildResult,
  SpatialOptions,
  AnalyserOptions,
  SamplerOptions,
  TriggerOptions,
  BufferPlayerOptions,
  VoiceOptions,
  FilePlayerOptions,
};
```
