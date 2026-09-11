---
name: audio-processor-authoring
description: >
  Write, extend, or review an `AudioProcessor` subclass from `@audiorective/core`
  — a synth, effect, sampler, analyser, or any class that owns Web Audio nodes,
  including turning a vanilla Web Audio function or module into a reusable
  processor class. Use whenever code extends AudioProcessor or defines
  params/cells with the build callback, wires nodes with `defineGraph`,
  declares processing latency, adds `input`/`output`, wraps an
  AudioWorkletNode, overrides `destroy`, or needs headless tests for a
  processor. Not for using the packages' built-in processors from app code
  (spatial panning, players, React hooks) — that is the `audiorective` skill.
license: MIT
compatibility: Browser runtime with the Web Audio API; TypeScript; `@audiorective/core` installed (tests use vitest browser mode and `@audiorective/devtools`).
---

# Audio Processor Authoring

How to write an `AudioProcessor` subclass correctly, end to end — skeleton,
state, graph wiring, latency, lifecycle, and tests.

> **Read [`references/authoring-processors.md`](references/authoring-processors.md)
> for the full walkthrough**, each section paired with a wrong/right example.
> [`references/core.md`](references/core.md) is the API reference for every
> type, option, and built-in processor.

## Skeleton

An effect: nodes are locals built _before_ `super()`, the build callback
returns `{ params, cells?, latency? }`, `this` is assigned only after `super()`
returns, and the internal graph is wired with `this.defineGraph`.

```typescript
import { AudioProcessor, type Param, type SchedulableParam } from "@audiorective/core";

class Tremolo extends AudioProcessor<{ rate: SchedulableParam; depth: SchedulableParam; bypass: Param<boolean> }> {
  private readonly _in: GainNode;
  private readonly _out: GainNode;
  private readonly _lfo: OscillatorNode;

  constructor(ctx: BaseAudioContext) {
    const input = new GainNode(ctx);
    const output = new GainNode(ctx);
    const wet = new GainNode(ctx, { gain: 1 });
    const lfo = new OscillatorNode(ctx, { frequency: 5 });
    const depth = new GainNode(ctx, { gain: 0.5 });
    lfo.start();

    super(ctx, ({ param }) => ({
      params: {
        rate: param({ default: 5, bind: lfo.frequency }), // AudioParam → SchedulableParam
        depth: param({ default: 0.5, bind: depth.gain }),
        bypass: param({ default: false }), // plain reactive flag
      },
      latency: 0, // no processing delay; the LFO is musical, not latency
    }));

    this._in = input;
    this._out = output;
    this._lfo = lfo;

    this.defineGraph(() => [
      [lfo, depth],
      [depth, wet.gain], // modulation target: an AudioParam sink
      this.params.bypass.value ? [input, output] : [input, wet], // conditional edge = bypass
      [wet, output],
    ]);
  }

  get input() {
    return this._in;
  }
  get output() {
    return this._out;
  }

  destroy() {
    this._lfo.stop(); // the base class doesn't own started sources
    super.destroy();
  }
}
```

An instrument is the same minus `input`. A class with no audio nodes at all
(a pattern, a preset list) is a plain class holding `Cell`s, not a processor.

## Checklist

- **Skeleton** — nodes built as locals before `super()`; build callback
  returns `{ params, cells?, latency? }`; `output` always present, `input`
  added only for effects; `this` assignments happen after `super()`.
- **State** — each value is a `param`, `schedulableParam`, or `cell` for the
  right reason; a data-only class doesn't extend `AudioProcessor`.
- **Graph** — wiring goes through `this.defineGraph`; conditional edges
  express bypass; `AudioParam`/`SchedulableParam` sinks used for modulation
  targets; raw `.connect()` only for a leaf that never joins another path.
- **Latency** — `latency: 0` for musical delay; a real processing delay
  declared in samples or derived from `ctx.sampleRate`; a worklet-backed
  processor declares its latency explicitly.
- **Lifecycle** — an overridden `destroy()` calls `super.destroy()` and
  stops/cleans up anything the base class doesn't own (started sources,
  worklet ports).
- **Testing** — headless vitest browser-mode tests; an `assertLatency` pin
  test for every processor with `input`.

## Common mistakes

| Mistake                                               | Why it breaks                                                                 | Section of `authoring-processors.md` |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------ |
| `this._gain = new GainNode(ctx)` before `super()`     | `this` doesn't exist yet; the build callback can't bind to it                 | 1. Skeleton                          |
| No `output` getter                                    | Nothing downstream can connect to the processor                               | 1. Skeleton                          |
| A data-only class extends `AudioProcessor`            | Owns a silencer and context it never uses; belongs in a plain `Cell` class    | 2. State                             |
| `param({ default })` for a value that needs ramps     | Plain `Param` has no scheduling; use `bind: audioParam` or `schedulableParam` | 2. State                             |
| Hand-rolled `.connect()`/`.disconnect()` for bypass   | No diffing, no latency compensation, leaks on teardown                        | 3. Graph                             |
| A bare `AudioWorkletNode` as a `defineGraph` endpoint | Rejected at runtime — its latency is unknowable                               | 3. Graph, 6. Worklet-backed          |
| Declaring a delay effect's `delayTime` as `latency`   | Musical delay isn't processing latency; PDC would over-compensate             | 4. Latency                           |
| `destroy()` override that skips `super.destroy()`     | Effects, params, and ConstantSources leak                                     | 5. Lifecycle                         |
| `latency: 441` for "10 ms" processing delay           | Wrong at any other sample rate; derive from `ctx.sampleRate`                  | 4. Latency                           |
| No `assertLatency` test on a processor with `input`   | The declared latency is never checked against an impulse through the graph    | 7. Testing                           |

## References

- [Authoring AudioProcessor Subclasses](references/authoring-processors.md) — the walkthrough
- [Core](references/core.md) — `AudioProcessor`, `Param`, `Cell`, `defineGraph`, latency, built-in processors
