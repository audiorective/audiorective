# @audiorective/core

Reactive primitives for Web Audio. The foundation package — everything else builds on this.

## Install

```bash
npm install @audiorective/core
```

## Param

Reactive parameter with a `.value` getter/setter matching Web Audio conventions. Built on [alien-signals](https://github.com/nicepkg/alien-signals).

```typescript
import { Param } from "@audiorective/core";

const volume = new Param({ default: 0.5, label: "Volume", min: 0, max: 1 });
volume.value = 0.8;
```

Raw signal access via `$` for framework adapters (Vue, Svelte, etc.):

```typescript
volume.$; // the underlying alien-signals Signal
```

## SchedulableParam

Extends `Param<number>` with Web Audio scheduling methods. Created when the `param` helper receives `bind: AudioParam`, or via the `schedulableParam` helper.

```typescript
synth.params.volume.value = 0.5;
synth.params.volume.linearRampToValueAtTime(1, ctx.currentTime + 2);
synth.params.volume.setTargetAtTime(0, ctx.currentTime + 3, 0.3);
```

Values scheduled on the audio thread are polled back into the signal via `requestAnimationFrame`, keeping your UI reactive during automations.

## AudioProcessor

Base class for audio DSP units. Subclasses declare their reactive surface as a typed `params` (and optional `cells`) registry, built once during construction via a callback passed to `super()`.

```typescript
import { AudioProcessor, Param, SchedulableParam } from "@audiorective/core";

class Synth extends AudioProcessor<{
  frequency: SchedulableParam;
  cutoff: SchedulableParam;
  volume: SchedulableParam;
  waveform: Param<OscillatorType>;
}> {
  private readonly osc: OscillatorNode;
  private readonly gain: GainNode;

  constructor(ctx: AudioContext) {
    const osc = new OscillatorNode(ctx, { type: "sawtooth" });
    const filter = new BiquadFilterNode(ctx);
    const gain = new GainNode(ctx);
    osc.connect(filter).connect(gain);
    osc.start();

    super(ctx, ({ param }) => ({
      params: {
        frequency: param({ default: 440, bind: osc.frequency }),
        cutoff: param({ default: 2000, bind: filter.frequency }),
        volume: param({ default: 0.5, bind: gain.gain }),
        waveform: param<OscillatorType>({
          default: "sawtooth",
          bind: { set: (v) => (osc.type = v) },
        }),
      },
    }));

    this.osc = osc;
    this.gain = gain;
  }

  get output() {
    return this.gain;
  }

  filterSweep(peakFreq = 8000, duration = 2) {
    const now = this.context.currentTime;
    const current = this.params.cutoff.read();
    this.params.cutoff.setValueAtTime(current, now);
    this.params.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.params.cutoff.linearRampToValueAtTime(current, now + duration);
  }
}
```

Access from outside is fully typed: `synth.params.cutoff.value` resolves to `number` and IntelliSense lists every key.

### Build helpers

The build callback receives helpers — they close over the AudioContext and the processor's internal silencer, so they handle node lifecycle for you.

| Helper call                                 | Returns            | Backing                                     |
| ------------------------------------------- | ------------------ | ------------------------------------------- |
| `param({ default: 120 })`                   | `Param<number>`    | Pure signal, no audio thread                |
| `param({ default: 0.5, bind: audioParam })` | `SchedulableParam` | Native AudioParam, sample-accurate          |
| `schedulableParam({ default: 120 })`        | `SchedulableParam` | Phantom ConstantSourceNode, sample-accurate |
| `param({ default: "sine", bind: { set } })` | `Param<string>`    | Reactive effect calls `set` on change       |
| `cell({ steps: [] })`                       | `Cell<T>`          | Structured reactive state                   |

### Computed and effects

`computed()` and `effect()` remain instance methods on `AudioProcessor`. They run after `super()` returns, so they can read from `this.params` freely:

```typescript
class Mixer extends AudioProcessor<{
  volume: SchedulableParam;
  muted: Param<boolean>;
}> {
  readonly effectiveVolume: () => number;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    super(ctx, ({ param }) => ({
      params: {
        volume: param({ default: 0.5, bind: gain.gain }),
        muted: param({ default: false }),
      },
    }));

    this.effectiveVolume = this.computed(() => (this.params.muted.value ? 0 : this.params.volume.value));

    this.effect(() => {
      gain.gain.value = this.effectiveVolume();
    });
  }
  // ...
}
```

## AudioEngine & createEngine

Lifecycle management for the audio context and processor graph.

```typescript
import { createEngine } from "@audiorective/core";

const engine = createEngine((ctx) => {
  const synth = new Synth(ctx);
  synth.output.connect(ctx.destination);
  return { synth };
});

engine.synth; // fully typed
await engine.start();
engine.state.value; // "running"
await engine.suspend();
engine.destroy(); // terminal — processors cleaned up, context closed
```

State transitions: `idle` -> `running` <-> `suspended` -> `destroyed`

The `AudioContext` is created eagerly at construction — the browser suspends it via autoplay policy. All processors are wired and accessible immediately. Only `start()` requires a user gesture.

## Framework-Agnostic

Works with any UI framework or headless in Node.js:

```typescript
import { effect } from "alien-signals";

effect(() => {
  console.log("Volume:", synth.volume.value);
});
```

## License

MIT — [GitHub](https://github.com/audiorective/audiorective)
