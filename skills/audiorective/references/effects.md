---
title: Effects
---

DSP effects for audiorective — the Tone.js replacement set. Ten `AudioProcessor` classes (nine effects plus `Channel`), a `SendBus`, and dB conversion helpers, all built on `@audiorective/core`.

## Install

```bash
pnpm add @audiorective/effects
```

## The contract

Every effect in this package is an `AudioProcessor` with a stable `input: GainNode` and `output: GainNode`, so it drops into `defineGraph` like any other processor. Continuous controls are `SchedulableParam`s (rampable, sample-accurate); controls that must rebuild a node (a WaveShaper curve, a filter type) are plain `Param`s. Every effect has `params.wet: SchedulableParam` (default `1`) — a linear crossfade between the dry input and the processed signal, computed from one automation signal so both arms land in step on a ramp. Bypass is `wet = 0`; effects stay connected at `wet = 0`, there is no connect/disconnect toggling. Each effect declares `latency` (samples) or lets it derive from its internal `defineGraph` — unless documented otherwise below, an effect's latency is its wet arm's latency, since the dry arm is delay-compensated to match. Every class accepts a `BaseAudioContext`, so the same code runs live or through `renderOffline` (from `@audiorective/core`).

## Effects

| Class              | Constructor options (defaults)                                                                                               | Params                                                                            | Cells                                                         | Latency                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Filter`           | `frequency` (350), `type` (`"lowpass"`), `Q` (1), `gain` (0), `rolloff` (`-12`, one of `-12\|-24\|-48`)                      | `frequency`, `Q`, `gain`: `SchedulableParam`; `type`: `Param<BiquadFilterType>`   | —                                                             | 0                                                                                                                   |
| `Distortion`       | `distortion` (0.4, 0..1), `oversample` (`"none"`)                                                                            | `distortion`: `Param<number>`                                                     | —                                                             | 0                                                                                                                   |
| `Phaser`           | `frequency` (0.5 Hz), `octaves` (3), `baseFrequency` (350), `Q` (10), `stages` (10)                                          | `frequency`, `Q`: `SchedulableParam`; `octaves`, `baseFrequency`: `Param<number>` | —                                                             | 0                                                                                                                   |
| `FrequencyShifter` | `frequency` (0 Hz)                                                                                                           | `frequency`: `SchedulableParam`                                                   | —                                                             | 0                                                                                                                   |
| `PingPongDelay`    | `delayTime` (0.25 s), `feedback` (0.2), `maxDelay` (1 s)                                                                     | `delayTime`, `feedback`: `SchedulableParam`                                       | —                                                             | 0                                                                                                                   |
| `Convolver`        | `buffer`, `url`, `normalize` (true)                                                                                          | —                                                                                 | `isReady: Cell<boolean>`                                      | 0                                                                                                                   |
| `PitchShift`       | `pitch` (0 semitones), `engine` (`"granular"`), `windowSize` (0.1 s, granular only), `stretch` (stretch-engine options)      | `pitch`: `Param<number>`                                                          | `isReady: Cell<boolean>`                                      | granular: `windowSize * sampleRate` samples, fixed; stretch: reported by the engine, updated as the node reports it |
| `Compressor`       | `threshold` (-24 dB), `ratio` (4), `knee` (6 dB), `attack` (0.003 s), `release` (0.25 s), `makeup` (0 dB), `lookahead` (0 s) | `threshold`, `ratio`, `knee`, `attack`, `release`, `makeup`: `SchedulableParam`   | `reduction: Cell<number>` (dB, ≤ 0), `isReady: Cell<boolean>` | `lookahead * sampleRate` samples, fixed at construction                                                             |
| `Limiter`          | `threshold` (-1 dB), `release` (0.05 s), `lookahead` (0.005 s)                                                               | `threshold`, `release`: `SchedulableParam`                                        | `reduction: Cell<number>` (dB, ≤ 0), `isReady: Cell<boolean>` | `lookahead * sampleRate` samples, fixed at construction                                                             |
| `Channel`          | `gain` (1, linear), `pan` (0), `mute` (false), `channelCount` (2)                                                            | `gain`, `pan`: `SchedulableParam`; `mute`: `Param<boolean>`                       | —                                                             | not an `Effect` subclass — no `wet`, no declared latency                                                            |

Every effect except `Channel` also exposes `params.wet: SchedulableParam` (default 1). `Channel` is a strip (gain → pan → mute), not a wet/dry effect, and sits outside the `Effect` base class.

```typescript
import { Filter, Distortion } from "@audiorective/effects";

const filter = new Filter(ctx, { frequency: 800, type: "highpass", rolloff: -24 });
const drive = new Distortion(ctx, { distortion: 0.6 });
source.connect(filter.input);
filter.output.connect(drive.input);
drive.output.connect(ctx.destination);

drive.params.wet.linearRampToValueAtTime(0, ctx.currentTime + 1); // fade to bypass over 1s
```

### Notes on individual effects

- **Distortion.** The waveshaper curve is Tone's shape normalized to unity peak, so `distortion = 0` is exactly unity gain (no coloration). `oversample` defaults to `"none"` because `"2x"`/`"4x"` add browser-defined latency the effect has no way to declare.
- **Phaser.** The wet arm sums the dry input with the phased signal at equal gain — that sum is what produces the notches, and `wet` blends between the plain dry input and that summed signal. With an even `stages` count, no notch sits exactly at `baseFrequency`.
- **PingPongDelay.** Input enters on the left delay line and bounces through the cross-feedback path to the right and back. Echoes that have crossed that feedback path arrive one render quantum (128 samples) later than `delayTime`, since a cycle in a Web Audio graph always delays one of its nodes by a quantum.
- **Compressor / Limiter.** See [Compressor and Limiter](#compressor-and-limiter) below.
- **PitchShift.** See [PitchShift engines](#pitchshift-engines) below.
- **Convolver.load().** The latest call to `load(url)` wins — an in-flight load that's superseded by a newer one is discarded silently. `ready` resolves once the constructor's initial `url` option (if given) has loaded; it is not re-armed by a later `load()` call.

## PitchShift engines

`PitchShift` has one param surface — `pitch` in semitones (-24..24) — over two interchangeable engines, chosen with `engine`:

- **`"granular"` (default).** Two delay lines swept by out-of-phase sawtooth LFOs and crossfaded — native nodes, no worklet, works everywhere including `OfflineAudioContext` with no setup. Latency equals `windowSize` (default 0.1 s) converted to samples, fixed for the processor's lifetime. A short window (`windowSize` at or below ~0.02 s) keeps latency low for pad chains that must stay tight against a beat, at the cost of an audible warble; the default 0.1 s window is smoother but smears pitch by roughly ±15 Hz. `isReady` is `true` immediately and `ready` resolves right away — there's nothing to load.
- **`"stretch"`.** Backed by [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch), a polyphonic WASM AudioWorklet with real formant handling. Construct with `engine: "stretch"`; the node is silent until its worklet module loads and starts — await `ready` (or watch `cells.isReady`) before expecting output. `stretch.blockMs` trades latency for quality: a smaller block lowers latency and stresses quality more, a larger one (the useful range runs roughly 40–120 ms) gets closer to offline-quality pitch shifting. `latency` is read back from the node in samples once it starts and is exposed as a `Param<number>` that updates live, so the graph re-solves compensation when it changes. Every stretch-node method (`configure`, `schedule`, `start`, `latency`) is an async round-trip to the worklet thread; `PitchShift` awaits each of them internally before resolving `ready`.

```typescript
import { PitchShift } from "@audiorective/effects";

// low-latency, for a tight pad chain
const pad = new PitchShift(ctx, { engine: "granular", pitch: 7, windowSize: 0.02 });

// quality, for a one-shot export
const stretch = new PitchShift(ctx, { engine: "stretch", pitch: -5, stretch: { blockMs: 80 } });
await stretch.ready;
console.log(stretch.latency.value); // samples, known only after `ready`
```

## Compressor and Limiter

Both share one internal gain-computer/detector core (`DynamicsCore`, not exported — construct `Compressor` or `Limiter` directly): threshold, ratio, knee, attack, and release feed a feedforward gain reduction curve, and a windowed peak detector looks `lookahead` seconds ahead to catch transients before they clip. The core runs in an `AudioWorkletNode` rather than the browser's built-in `DynamicsCompressorNode` so behavior — knee shape, lookahead, detector — is identical across browsers and in offline renders, where a promise made about export bytes can't depend on Chrome, Firefox, and Safari agreeing.

`Limiter` is the same core preset to a brickwall: ratio `Infinity`, knee `0`, attack `1 ms`, and only `threshold`, `release`, and `lookahead` are exposed as constructor options (`threshold` and `release` as params) — ratio, knee, and attack are fixed. The windowed peak detector over `lookahead` is what actually holds the ceiling at `threshold`.

Both expose `cells.reduction: Cell<number>` — the current gain reduction in dB (≤ 0) — for a meter, and `cells.isReady: Cell<boolean>` alongside a `ready: Promise<void>` that resolves once the worklet has loaded and the node is wired in. `lookahead` is fixed at construction for both classes; it sets the worklet's internal buffer size and cannot be changed live. Because the detector runs sample-by-sample rather than block-by-block, `Compressor`'s output gain on a steady sine settles to within about half a dB of the value a static gain-computer formula would predict — the sample-level detector ripples slightly around it.

```typescript
import { Compressor, Limiter } from "@audiorective/effects";

const comp = new Compressor(ctx, { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 });
const limiter = new Limiter(ctx, { threshold: -1 });
await Promise.all([comp.ready, limiter.ready]);

source.connect(comp.input);
comp.output.connect(limiter.input);
limiter.output.connect(ctx.destination);

meterEl.textContent = `${limiter.cells.reduction.value.toFixed(1)} dB`;
```

## Channel and SendBus

`Channel` is a gain → pan → mute strip: `gain` and `pan` are `SchedulableParam`s (`gain` is linear, not dB — convert with `dbToGain`/`gainToDb` from this package), `mute` is a boolean `Param`. `channel.send(bus, name, gain?)` taps the channel's post-mute output into a named receive point on a `SendBus` and returns a `Send` (`{ gain: SchedulableParam, dispose() }`); `send.gain` is also linear. A `SendBus` is instance-scoped — define receive points with `bus.define(name)`, read them back with `bus.receive(name)` (throws if undefined) — not a global registry. `SendBus.destroy()` disconnects every receive node; it cannot see the sends still feeding them, so call it only after every dependent `Send` has been disposed.

An FX rack — five inserts in series, two sends to shared buses, a master limiter — fits inside one `defineGraph` in an `AudioProcessor`:

```typescript
import { AudioProcessor } from "@audiorective/core";
import { Channel, SendBus, Filter, Compressor, Distortion, Phaser, PingPongDelay, Limiter, dbToGain } from "@audiorective/effects";

class FxRack extends AudioProcessor<{}> {
  private readonly _output: GainNode;
  readonly channel: Channel;
  readonly bus: SendBus;

  constructor(ctx: BaseAudioContext) {
    const output = new GainNode(ctx);
    const bus = new SendBus(ctx);
    bus.define("delay");
    bus.define("hall");

    const channel = new Channel(ctx, { gain: dbToGain(-6) });
    const filter = new Filter(ctx, { frequency: 400, type: "highpass" });
    const comp = new Compressor(ctx, { threshold: -18, ratio: 3 });
    const drive = new Distortion(ctx, { distortion: 0.2 });
    const phaser = new Phaser(ctx, { frequency: 0.3 });
    const master = new Limiter(ctx, { threshold: -1 });
    const delayFx = new PingPongDelay(ctx, { delayTime: 0.3, feedback: 0.35 });
    const hallFx = new Filter(ctx, { frequency: 3000, type: "lowpass" }); // stand-in for a reverb IR chain

    super(ctx, () => ({ params: {} }));
    this._output = output;
    this.channel = channel;
    this.bus = bus;

    channel.send(bus, "delay", 0.25);
    channel.send(bus, "hall", 0.15);
    bus.receive("delay").connect(delayFx.input);
    bus.receive("hall").connect(hallFx.input);

    this.defineGraph(() => [
      [channel, filter],
      [filter, comp],
      [comp, drive],
      [drive, phaser],
      [phaser, master],
      [master, output],
      [delayFx, master],
      [hallFx, master],
    ]);
  }

  get output(): GainNode {
    return this._output;
  }

  get input(): GainNode {
    return this.channel.input;
  }
}
```

## Offline export

`renderOffline` (from `@audiorective/core`) builds an `OfflineAudioContext`, runs an async `setup` callback, and returns the rendered `AudioBuffer`. Await `ready` on every worklet-backed effect (`Compressor`, `Limiter`, `PitchShift` with `engine: "stretch"`) inside `setup` before rendering starts:

```typescript
import { renderOffline } from "@audiorective/core";
import { Limiter, Compressor } from "@audiorective/effects";

const wav = await renderOffline({ seconds: 8, channels: 2, sampleRate: 44100 }, async (ctx) => {
  const comp = new Compressor(ctx, { threshold: -18, ratio: 3 });
  const limiter = new Limiter(ctx, { threshold: -1 });
  await Promise.all([comp.ready, limiter.ready]);

  source.connect(comp.input);
  comp.output.connect(limiter.input);
  limiter.output.connect(ctx.destination);
});
```

## Coming from Tone.js

| Tone usage                                          | Replacement                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `Tone.PitchShift({ pitch, windowSize })`            | `PitchShift({ engine, pitch, windowSize })`                        |
| `Tone.Filter(f, type, -24)`                         | `Filter({ frequency: f, type, rolloff: -24 })`                     |
| `Tone.FrequencyShifter()`                           | `FrequencyShifter()`                                               |
| `Tone.Distortion(0.5)`                              | `Distortion({ distortion: 0.5 })`                                  |
| `Tone.Phaser({ frequency, baseFrequency, wet: 0 })` | `Phaser({ frequency, baseFrequency })`, `wet.value = 0`            |
| `Tone.PingPongDelay('4n', 0.2)`                     | `PingPongDelay({ delayTime: 0.5, feedback: 0.2 })`                 |
| `Tone.Convolver(url)`                               | `Convolver({ url })`                                               |
| `Tone.Limiter(-1)`                                  | `Limiter({ threshold: -1 })`                                       |
| `Tone.Channel` + `send`/`receive(key)`              | `Channel` + `SendBus.define(key)` / `channel.send(bus, key)`       |
| `channel.set({ volume: dB })` ramp                  | `send.gain.linearRampToValueAtTime(dbToGain(dB), t)`               |
| `effect.set({ wet })` / disconnect on min           | `effect.params.wet.linearRampToValueAtTime(v, t)`                  |
| `Tone.Offline(cb, s, 2, rate)`                      | `renderOffline({ seconds: s, channels: 2, sampleRate: rate }, cb)` |

## Advanced: pre-warming worklets

`registerWorklet(ctx, name, source)` is exported for apps that want to load a worklet module ahead of first use (e.g. during a loading screen) rather than on first construction of `Compressor`, `Limiter`, or a stretch-engine `PitchShift`. `Compressor` and `Limiter` call it with the same `(ctx, name)` pair internally, so a pre-warm call and the effect's own call share one `addModule` load.
