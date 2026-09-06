---
title: Authoring AudioProcessor Subclasses
---

How to write an `AudioProcessor` subclass — a synth, effect, sampler, analyser, or any class
that owns Web Audio nodes. For the full API reference (types, options, every built-in
processor) see [`core.md`](./core.md); this doc teaches the workflow, in the same
wrong/right style as [`architecture.md`](./architecture.md).

## 1. Skeleton

Audio nodes are constructed as **locals before `super()`**, so the build callback can close
over them. The callback returns `{ params, cells?, latency? }`. `output` is required on every
processor; add `input` only when the processor transforms incoming audio (an effect), not
when it produces audio from scratch (an instrument). Anything the rest of the class also
needs on `this` gets assigned **after** `super()` returns — `this` isn't usable until then.

### Wrong — nodes on `this` before `super()`, no `output`

```typescript
class Wobble extends AudioProcessor<{ depth: Param<number> }> {
  constructor(ctx: AudioContext) {
    this._gain = new GainNode(ctx); // error: 'this' before super()
    super(ctx, ({ param }) => ({
      params: { depth: param({ default: 0.5, bind: this._gain.gain }) }, // this._gain doesn't exist yet
    }));
  }
  // no output getter — nothing downstream can connect to this processor
}
```

### Right — locals close over the callback, `this` assigned after

```typescript
class Wobble extends AudioProcessor<{ depth: Param<number> }> {
  private readonly _gain: GainNode;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx); // local, built before super()
    super(ctx, ({ param }) => ({
      params: { depth: param({ default: 0.5, bind: gain.gain }) },
    }));
    this._gain = gain; // assigned after super() returns
  }

  get output() {
    return this._gain;
  }
}
```

## 2. State

Three primitives cover a processor's reactive surface:

- **`param`** — plain `Param<T>`, or `SchedulableParam` when `bind` is an `AudioParam`.
- **`schedulableParam`** — `SchedulableParam` without a real `AudioParam` to bind to (backed by
  a phantom `ConstantSourceNode`).
- **`cell`** — structured/complex data (step patterns, presets) via Immer `.update()`. Lives in
  `processor.cells`, not `processor.params`.

| Shape          | When to use                     | Result                                       |
| -------------- | ------------------------------- | -------------------------------------------- |
| No `bind`      | Pure JS state (flags, arrays)   | `Param<T>`                                   |
| `AudioParam`   | Controls a Web Audio node param | `SchedulableParam` (native, sample-accurate) |
| `{ get, set }` | Sync to non-AudioParam property | `Param<T>` with reactive effect              |

A class that only holds structured state and owns no `AudioNode`s should not extend
`AudioProcessor` at all — use a plain `Cell` class instead, per `architecture.md`.

### Wrong — a data-only class extends AudioProcessor

```typescript
class DrumPattern extends AudioProcessor<{ steps: Param<boolean[]> }> {
  constructor(ctx: AudioContext) {
    super(ctx, ({ param }) => ({
      params: { steps: param({ default: Array(16).fill(false) }) },
    }));
  }

  get output() {
    return undefined; // no audio output — this class owns no nodes
  }
}
```

### Right — plain class with Cell

```typescript
class DrumPattern {
  readonly steps = cell<boolean[]>(Array(16).fill(false));

  toggleStep(index: number) {
    this.steps.update((draft) => {
      draft[index] = !draft[index];
    });
  }
}
```

## 3. Graph

Wire the processor's internal audio graph with `this.defineGraph`, not direct
`.connect()`/`.disconnect()` calls — it diffs edges on every reactive re-run, resolves latency
compensation, and rejects a bare `AudioWorkletNode` at both the type and runtime level (wrap
it in an `AudioProcessor` that declares `latency` instead).

### Wrong — hand-rolled connect/disconnect for a conditional bypass

```typescript
class Distortion extends AudioProcessor<{ bypass: Param<boolean> }> {
  constructor(ctx: AudioContext, shaper: WaveShaperNode, dry: GainNode) {
    super(ctx, ({ param }) => ({
      params: { bypass: param({ default: false }) },
    }));

    this.effect(() => {
      // manual rewiring on every toggle — easy to leak a stale connection
      shaper.disconnect();
      dry.disconnect();
      if (this.params.bypass.value) {
        dry.connect(this._out);
      } else {
        shaper.connect(this._out);
      }
    });
  }
}
```

### Right — conditional edges via defineGraph

```typescript
class Distortion extends AudioProcessor<{ bypass: Param<boolean> }> {
  private readonly _out: GainNode;

  constructor(ctx: AudioContext) {
    const shaper = new WaveShaperNode(ctx);
    const dry = new GainNode(ctx);
    const out = new GainNode(ctx);

    super(ctx, ({ param }) => ({
      params: { bypass: param({ default: false }) },
    }));

    this._out = out;

    this.defineGraph(() => [this.params.bypass.value && [dry, out], !this.params.bypass.value && [shaper, out]]);
  }

  get output() {
    return this._out;
  }
}
```

A falsy entry (`condition && [from, to]`) is simply skipped, so branches read as inline
conditions rather than imperative rewiring. Endpoints can be an `AudioProcessor` (connects
from its `output`) or an `AudioNode`; a sink can additionally be an `AudioParam` or
`SchedulableParam` — `[lfo, filter.frequency]` — for modulation targets. Nested processors
work the same way: `[oscillatorProcessor, filterEffectProcessor]` connects the first's
`output` to the second's `input`.

Raw `.connect()` is fine for a leaf connection inside the processor that never joins another
path — a node that always feeds exactly one fixed destination and never participates in
bypass, mixing, or compensation. The oscillator-to-shaper edge above could stay a raw
`.connect()` if `Distortion` never bypassed it; once a second path joins at the same sink,
move it into `defineGraph` so compensation and diffing see it.

## 4. Latency

`latency` is **processing delay** — the fixed delay before the earliest output for an impulse
at `input` — not musical delay. A delay line, a reverb tail, chorus modulation: these are
intentional and declare `latency: 0`. Only a processor that buffers beyond the current
render quantum (worklet lookahead, an FFT hop) has real latency to declare.

Declare it three ways in the build callback, or omit it to let `defineGraph` derive it:

```typescript
latency: 512; // fixed sample count
latency: param({ default: 512 }); // changes at runtime (e.g. a limiter's lookahead)
latency: Math.round(0.01 * ctx.sampleRate); // time-based — survives a sample-rate change
```

Prefer the time-based form (`ctx.sampleRate`-derived) whenever the real-world delay is fixed
in seconds/ms rather than samples — a sample-count literal silently changes duration if the
context runs at a different rate.

When a processor calls `this.defineGraph(...)` and declares no `latency`, it's derived: the
longest path in samples from `input` to `output` through its own graph. Reserve an explicit
declaration for processors whose true latency isn't visible in the graph — most commonly one
wrapping an `AudioWorkletNode`, whose lookahead `defineGraph` can't see.

For the runtime-ownership subtlety with a `param()`-created `latency` (destroy-tracking, the
`AudioParam`-sink footgun), see [Latency (PDC) in `core.md`](./core.md#latency-pdc) — this doc
only covers the authoring decision, not the mechanism.

### Wrong — sample-count literal for a time-based delay

```typescript
super(ctx, ({ param }) => ({
  params: {
    /* ... */
  },
  latency: 441, // "10ms at 44.1kHz" — wrong at any other sample rate
}));
```

### Right — derive from ctx.sampleRate

```typescript
super(ctx, ({ param }) => ({
  params: {
    /* ... */
  },
  latency: Math.round(0.01 * ctx.sampleRate), // 10ms, any sample rate
}));
```

## 5. Lifecycle

`AudioProcessor.destroy()` already disposes every graph created via `defineGraph`, stops every
effect registered via `effect()`, calls `destroy()` on every param in `params` (unregistering
bind effects and `ParamSync`), destroys a `latency` param it created itself, and disconnects
every internally-created `ConstantSourceNode` (the ones behind `schedulableParam` without a
real `AudioParam`). Cells are **not** destroyed — they're plain reactive containers with no
audio-graph resources.

A subclass overriding `destroy()` must call `super.destroy()` and add cleanup for anything the
base class doesn't know about: stopping a source node it started (`OscillatorNode.stop()`,
`ConstantSourceNode.stop()`), and closing a worklet's `MessagePort`.

### Wrong — override destroy() without cleaning up owned sources

```typescript
class Drone extends AudioProcessor<{ freq: SchedulableParam }> {
  private readonly _osc: OscillatorNode;

  constructor(ctx: AudioContext) {
    const osc = new OscillatorNode(ctx);
    super(ctx, ({ param }) => ({
      params: { freq: param({ default: 220, bind: osc.frequency }) },
    }));
    this._osc = osc;
    this._osc.start();
  }

  get output() {
    return this._osc;
  }

  // no destroy() override — the oscillator keeps running forever
}
```

### Right — stop what the base class doesn't own

```typescript
class Drone extends AudioProcessor<{ freq: SchedulableParam }> {
  private readonly _osc: OscillatorNode;

  constructor(ctx: AudioContext) {
    const osc = new OscillatorNode(ctx);
    super(ctx, ({ param }) => ({
      params: { freq: param({ default: 220, bind: osc.frequency }) },
    }));
    this._osc = osc;
    this._osc.start();
  }

  get output() {
    return this._osc;
  }

  override destroy() {
    this._osc.stop();
    super.destroy();
  }
}
```

## 6. Testing

Both functions in `@audiorective/devtools` render a real `OfflineAudioContext`, so tests need
a browser test environment, not jsdom — vitest browser mode with headless Chromium. A
subtlety to plan around: an `AudioParam` ramp (or any automation) won't advance unless the
node subgraph it lives on reaches `ctx.destination` — a disconnected or dangling node gets
optimized out and its automation freezes, same as the ConstantSourceNode silencer trick
described in `core.md`.

For every processor that declares `input` (an effect), write an `assertLatency` pin test —
it's the default test for that shape of processor, not optional coverage. It sends a
single-sample impulse into `input`, renders offline at each configured sample rate, and checks
where the impulse arrives at `output` against the declared `latency`:

```ts
import { assertLatency } from "@audiorective/devtools";
import { MyEffect } from "../src/MyEffect";

it("declares its latency correctly", async () => {
  await assertLatency((ctx) => new MyEffect(ctx));
});
```

Write it once against the processor's current declaration and run it. A wrong declaration
throws with a message that names the fix — the exact `latency: ...` line to paste into the
build callback — so treat a failure as the test doing its job, not as something to work
around.

## 7. Checklist

- **Skeleton** — nodes built as locals before `super()`; build callback returns
  `{ params, cells?, latency? }`; `output` always present, `input` added only for effects;
  `this` assignments happen after `super()`.
- **State** — each value is a `param`, `schedulableParam`, or `cell` for the right reason; a
  data-only class doesn't extend `AudioProcessor`.
- **Graph** — wiring goes through `this.defineGraph`; conditional edges express bypass;
  `AudioParam`/`SchedulableParam` sinks used for modulation targets; raw `.connect()` only for
  a leaf that never joins another path.
- **Latency** — `latency: 0` for musical delay; a real processing delay declared in samples or
  derived from `ctx.sampleRate`; a worklet-backed processor declares its latency explicitly.
- **Lifecycle** — an overridden `destroy()` calls `super.destroy()` and stops/cleans up
  anything the base class doesn't own (started sources, worklet ports).
- **Testing** — headless vitest browser-mode tests; an `assertLatency` pin test for every
  processor with `input`.
