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

Extends `Param<number>` with Web Audio scheduling methods. Created when `param()` is called with `bind: AudioParam` or `schedulable: true`.

```typescript
synth.volume.value = 0.5;
synth.volume.linearRampToValueAtTime(1, ctx.currentTime + 2);
synth.volume.setTargetAtTime(0, ctx.currentTime + 3, 0.3);
```

Values scheduled on the audio thread are polled back into the signal via `requestAnimationFrame`, keeping your UI reactive during automations.

## AudioProcessor

Base class for audio DSP units. Provides `param()`, `computed()`, `effect()`, and state serialization.

```typescript
import { AudioProcessor } from "@audiorective/core";

class Synth extends AudioProcessor {
  private osc = new OscillatorNode(this.context, { type: "sawtooth" });
  private filter = new BiquadFilterNode(this.context);
  private gain = new GainNode(this.context);

  frequency = this.param({ default: 440, bind: this.osc.frequency });
  cutoff = this.param({ default: 2000, bind: this.filter.frequency });
  volume = this.param({ default: 0.5, bind: this.gain.gain });
  waveform = this.param({
    default: "sawtooth" as OscillatorType,
    bind: { set: (v) => (this.osc.type = v) },
  });

  constructor(ctx: AudioContext) {
    super(ctx);
    this.osc.connect(this.filter).connect(this.gain);
    this.osc.start();
  }

  get output() {
    return this.gain;
  }

  filterSweep(peakFreq = 8000, duration = 2) {
    const now = this.context.currentTime;
    const current = this.cutoff.read();
    this.cutoff.setValueAtTime(current, now);
    this.cutoff.linearRampToValueAtTime(peakFreq, now + duration / 2);
    this.cutoff.linearRampToValueAtTime(current, now + duration);
  }
}
```

### `param()` overloads

| Call                                              | Returns            | Backing                                     |
| ------------------------------------------------- | ------------------ | ------------------------------------------- |
| `this.param({ default: 120 })`                    | `Param<number>`    | Pure signal, no audio thread                |
| `this.param({ default: 0.5, bind: audioParam })`  | `SchedulableParam` | Native AudioParam, sample-accurate          |
| `this.param({ default: 120, schedulable: true })` | `SchedulableParam` | Phantom ConstantSourceNode, sample-accurate |
| `this.param({ default: "sine", bind: { set } })`  | `Param<string>`    | Reactive effect calls `set` on change       |

### Computed and effects

```typescript
class Mixer extends AudioProcessor {
  volume = this.param({ default: 0.5, bind: this.gain.gain });
  muted = this.param({ default: false });

  effectiveVolume = this.computed(() => (this.muted.value ? 0 : this.volume.value));

  constructor(ctx: AudioContext) {
    super(ctx);
    this.effect(() => {
      this.gain.gain.value = this.effectiveVolume.value;
    });
  }
  // ...
}
```

### State serialization

```typescript
const state = synth.getState(); // { version: 1, parameters: { volume: 0.5, ... } }
synth.setState(state);
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
