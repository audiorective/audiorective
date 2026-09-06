# `@audiorective/effects` — Design

_Status: draft for review. Date: 2026-09-06._

## Goal

Give audiorective a DSP effects package so an app built on `@audiorective/core`
never needs Tone.js. The package covers every effect tmc-cl1 (the reference
consumer) still takes from Tone — pitch shift, filter, frequency shifter,
distortion, phaser, ping-pong delay, convolution reverb, limiter — plus a
compressor and the channel-strip and send-bus plumbing the effects are wired
through. Every effect is an `AudioProcessor` with `input`, `output`, reactive
params, a declared `latency`, and a `wet` control, so it drops into
`defineGraph` and React bindings like any other processor.

Two effects justify real DSP work: **PitchShift** gets a higher-quality engine
than Tone's granular delay (Signalsmith Stretch, MIT, WASM AudioWorklet), and
**Compressor / Limiter** run in an AudioWorklet so they behave identically on
every browser and in offline renders. Everything else is a graph of native Web
Audio nodes, which already run in the browser's optimized audio thread and
work inside `OfflineAudioContext` without loading anything.

Three deliverables:

1. **`@audiorective/effects`** — the package: ten processors, a send bus, dB
   helpers.
2. **core** — `renderOffline`, a helper that builds an `OfflineAudioContext`,
   loads worklet modules, runs a setup callback, and returns the rendered
   `AudioBuffer`.
3. **docs + skill** — `docs/effects.md` and a matching `references/effects.md`
   in the plugin skill, so an agent can build an FX rack without reading source.

## Background

- **Where Tone still lives in tmc-cl1 (2026-09-06 audit).** Timing, transport,
  reactive state, and the official-machine decks are already on audiorective.
  Tone remains for: the pad player DSP (PitchShift, Filter, Gain per pad), the
  FX rack (`effects.ts`: five inserts in series, three sends behind
  `Tone.Channel` on a named send/receive bus with a 400 Hz highpass), the
  offline export graph (`Tone.Offline` with a global FX chain and
  `Tone.Limiter(-1)`), and context plumbing (`Tone.start`, `statechange`,
  `lookAhead`). `Tone.Channel` appears sixteen times; `Tone.ToneAudioNode`
  fifteen. No component imports Tone directly; everything is inside the audio
  layer, so the swap is contained.
- **What Tone's effects actually are.** Each is a 50–150 line graph of native
  nodes: `Filter` stacks biquads for steeper rolloff; `Distortion` is a
  `WaveShaperNode` with a fixed curve and oversampling off; `Phaser` is ten
  allpass biquads per channel under one LFO; `FrequencyShifter` is a Hilbert
  pair built from two allpass chains, ring-modulated by quadrature sines;
  `PingPongDelay` is two cross-fed `DelayNode`s; `Limiter` is a
  `DynamicsCompressorNode` at ratio 20. Porting these is mechanical. The
  library adds value not in the DSP but in the contract around it.
- **Why not wrap Tuna or Pizzicato.** Both are MIT and cover the conventional
  effects, but neither has a `wet` convention, schedulable params, declared
  latency, or a frequency shifter. Wrapping them means adapting every
  parameter anyway; porting is the same effort with a cleaner result.
- **Pitch shift options surveyed.** Tone/Chrome "Jungle" granular (MIT/Apache,
  low latency, warbly); [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch)
  1.3.2 (MIT, polyphonic STFT with formant handling, live-input mode,
  configurable block size, reports its own latency, ~230 KB unpacked, loads
  its worklet from an inline Blob so it needs no bundler support); phaze
  (Unlicense, phase vocoder, unmaintained since 2021, not on npm);
  SoundTouchJS worklet (MPL-2.0, WSOLA, designed around buffer playback);
  Rubber Band (GPL, paid commercial licence — excluded); Faust
  `ef.transpose_windowed` via faustwasm (LGPL, same algorithm family as
  Tone, plus a toolchain). Signalsmith is the only MIT, real-time, maintained
  option with better quality than granular.
- **Why the dynamics go in a worklet.** `DynamicsCompressorNode` has a fixed
  soft knee and browser-defined lookahead and detector behaviour; Chrome,
  Firefox and Safari produce different output for the same input. An export
  path that promises the same bytes on every device cannot depend on it. A
  compressor in plain JS math renders identically everywhere, and a limiter is
  the same core with infinite ratio, hard knee, and lookahead.
- **Two tmc-cl1 quirks the port will surface.** Its `PitchShift` is built with
  `windowSize: 0.01`, a 10 ms grain that makes the current shifter unusually
  gritty. Its `PingPongDelay` is built with `'4n'`, which Tone resolves against
  its own transport BPM — never set by the app — so the delay is a fixed 0.5 s
  regardless of cassette tempo. Neither is a target to preserve.

## Decisions (locked)

| Decision           | Choice                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package boundary   | New `@audiorective/effects`, depends only on `core` (+ `signalsmith-stretch`). Core users never pay for WASM.                                                                |
| Fidelity to Tone   | Parameter names and ranges match Tone where they exist so configs map 1:1. Output is **not** byte-exact; consumers re-pin golden masters.                                    |
| Effect contract    | `AudioProcessor` with `input`, `output`, `wet: SchedulableParam` (0..1, linear crossfade), continuous controls as `SchedulableParam`, discrete as `Param`.                   |
| Bypass             | `wet = 0`. Effects stay in the graph; no connect/disconnect toggling by callers.                                                                                             |
| Native vs worklet  | Native node graphs for Filter, Distortion, Phaser, FrequencyShifter, PingPongDelay, Convolver, granular PitchShift. Worklet for Compressor, Limiter, stretch PitchShift.     |
| PitchShift engines | One processor, `engine: "granular" \| "stretch"`. Same param surface. Granular for low-latency pad chains; stretch for quality.                                              |
| Dynamics scope     | Plain feedforward compressor with threshold/ratio/knee/attack/release/makeup/lookahead. Limiter is the same core preset. No modelled-hardware modes.                         |
| Worklet shipping   | Each worklet processor is a self-contained source string registered through a per-context loader that dedupes `addModule` and serves a Blob URL. No bundler config required. |
| Volume units       | Gains are linear `SchedulableParam`s bound to `GainNode.gain`. `dbToGain` / `gainToDb` helpers convert at the call site. No dB-typed params.                                 |
| Tempo-synced delay | Not provided. `PingPongDelay.delayTime` is seconds; `@audiorective/clock` owns tempo and the caller converts.                                                                |
| Send bus           | Instance-scoped `SendBus`, not a global name registry like Tone's.                                                                                                           |
| Offline render     | `renderOffline` lives in `core`; effects is one consumer.                                                                                                                    |

## Part 1 — package and shared conventions

### 1.1 Package

`packages/effects`, published as `@audiorective/effects`, versioned with the
rest (`bumpp -r --all`). Same tooling as `devtools`: tsdown ESM + dts, vitest
browser mode (headless Chromium). Dependencies: `@audiorective/core`
(`workspace:^`), `signalsmith-stretch` (`^1.3.2`).

Exports:

```typescript
export { Filter, Distortion, Phaser, FrequencyShifter, PingPongDelay, Convolver } from …;
export { Compressor, Limiter } from …;
export { PitchShift } from …;
export { Channel, SendBus } from …;
export { dbToGain, gainToDb } from …;
export { registerWorklet } from …; // advanced: pre-warm modules
export type { …Options } from …;
```

### 1.2 Effect contract

Every effect:

- extends `AudioProcessor<P, C>` and takes `(ctx: BaseAudioContext, options?)`;
- exposes `input: GainNode` and `output: GainNode` (stable references — the
  internal graph may be rebuilt, the endpoints never are);
- has `params.wet: SchedulableParam` (default 1) implemented by the shared
  `wetDry` helper: `input → dry GainNode → output` and
  `input → effect → wet GainNode → output`, where `wet.gain` is bound to
  `params.wet` and `dry.gain` follows `1 − wet` through a
  `ConstantSourceNode(1)` summed with the wet signal through a `Gain(−1)`, so
  ramps on `wet` are sample-accurate on both arms;
- wires its internals with `this.defineGraph` so conditional pieces (stretch
  engine ready, IR loaded) are edges, not manual connects;
- declares `latency` (a number, or a `Param<number>` when it changes at
  runtime);
- cleans up owned sources (LFO oscillators, constant sources, worklet ports)
  in `destroy()`.

Continuous controls are `SchedulableParam`s bound to the underlying
`AudioParam` where one exists. Controls that must rebuild a node (a
WaveShaper curve, a filter type) are plain `Param`s with a `bind.set`.

### 1.3 Worklet loader

`registerWorklet(ctx, name, source): Promise<void>`. Keeps a
`WeakMap<BaseAudioContext, Map<name, Promise<void>>>`; the first call for a
`(ctx, name)` creates a Blob URL from `source`, calls
`ctx.audioWorklet.addModule`, and caches the promise; later calls return it.
Works for `OfflineAudioContext`. Throws a clear error when `ctx.audioWorklet`
is undefined (jsdom, very old Safari) naming the processor that needed it.

Worklet processors are authored as plain JavaScript inside a template-string
constant in `src/worklets/*.worklet.ts` (`export const DYNAMICS_WORKLET =
/* js */ \`…\``). No extra build step; the trade-off is that the worklet body
is not type-checked, so its tests carry that weight.

### 1.4 dB helpers

```typescript
dbToGain(db: number): number; // 10 ** (db / 20)
gainToDb(gain: number): number; // 20 * log10(gain), −Infinity at 0
```

## Part 2 — native-graph effects

All defaults follow Tone 14.7 unless noted. `wet` is on every effect and
omitted from the tables.

### 2.1 Filter

`Filter(ctx, { frequency = 350, type = "lowpass", Q = 1, gain = 0, rolloff = -12 })`

| Param       | Kind                      | Notes                                     |
| ----------- | ------------------------- | ----------------------------------------- |
| `frequency` | `SchedulableParam` (Hz)   | bound to every stage's `frequency`        |
| `Q`         | `SchedulableParam`        | bound to every stage                      |
| `gain`      | `SchedulableParam` (dB)   | native biquad gain; shelving/peaking only |
| `type`      | `Param<BiquadFilterType>` | rewrites each stage's `type`              |

`rolloff` is a constructor option (`-12 | -24 | -48`), one biquad per 12 dB
in series. One `SchedulableParam` drives every stage: `frequency` binds to a
`ConstantSourceNode.offset` whose output connects to each stage's `frequency`
`AudioParam` (the stage's own value held at 0, so the summed value is the
source). `Q` uses the same pattern. Latency 0.

### 2.2 Distortion

`Distortion(ctx, { distortion = 0.4, oversample = "4x" })`

| Param        | Kind            | Notes                                                                                                                              |
| ------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `distortion` | `Param<number>` | 0..1; regenerates Tone's curve `((3 + k) * x * 20 * deg) / (π + k * abs(x))`, `k = distortion * 100`, `deg = π / 180`, 4096 points |

`oversample` is a constructor option (`"none" | "2x" | "4x"`); default `"4x"`
(Tone's default is off and aliases at high drive). Latency 0.

### 2.3 Phaser

`Phaser(ctx, { frequency = 0.5, octaves = 3, baseFrequency = 350, Q = 10, stages = 10 })`

| Param           | Kind                    | Notes                                                       |
| --------------- | ----------------------- | ----------------------------------------------------------- |
| `frequency`     | `SchedulableParam` (Hz) | LFO rate                                                    |
| `octaves`       | `Param<number>`         | LFO sweep range above `baseFrequency`; recomputes LFO depth |
| `baseFrequency` | `Param<number>` (Hz)    | LFO floor; recomputes LFO depth                             |
| `Q`             | `SchedulableParam`      | bound to every allpass stage                                |

Per channel (stereo split/merge), `stages` allpass biquads in series, all
`frequency`s driven by one sine LFO (`OscillatorNode` → `GainNode` depth →
`ConstantSourceNode` offset). Latency 0.

### 2.4 FrequencyShifter

`FrequencyShifter(ctx, { frequency = 0 })`

| Param       | Kind                    | Notes                                      |
| ----------- | ----------------------- | ------------------------------------------ |
| `frequency` | `SchedulableParam` (Hz) | shift; negative selects the lower sideband |

Hilbert transformer as two parallel allpass chains (Tone's
`PhaseShiftAllpass` coefficients, Olli Niemitalo's design) producing I and Q,
multiplied by a sine and a cosine `OscillatorNode` at `frequency` and summed.
`frequency` binds to a `ConstantSourceNode.offset` that feeds both
oscillators' `frequency` params. `OscillatorNode` accepts negative
frequencies, which flips the sine's sign and leaves the cosine unchanged, so
the sideband follows the sign of `frequency` with no extra nodes. Latency 0.

### 2.5 PingPongDelay

`PingPongDelay(ctx, { delayTime = 0.25, feedback = 0.2, maxDelay = 1 })`

| Param       | Kind                      | Notes                        |
| ----------- | ------------------------- | ---------------------------- |
| `delayTime` | `SchedulableParam` (s)    | bound to both delays         |
| `feedback`  | `SchedulableParam` (0..1) | bound to both feedback gains |

Left input → `DelayNode` L → output L and → feedback → `DelayNode` R →
output R and → feedback → L. Mono input is split to both. Latency 0 (delay
is intentional, not signal-path latency).

### 2.6 Convolver

`Convolver(ctx, { buffer?, url?, normalize = true })`

| Member          | Kind                  | Notes                                     |
| --------------- | --------------------- | ----------------------------------------- |
| `buffer`        | `AudioBuffer \| null` | setter assigns `ConvolverNode.buffer`     |
| `load(url)`     | `Promise<void>`       | via `AudioBufferCache` shared per context |
| `cells.isReady` | `Cell<boolean>`       | true once a buffer is set                 |

While `isReady` is false the wet arm is silent, so the dry arm passes.
Latency 0.

### 2.7 PitchShift, granular engine

Described in Part 3 with the stretch engine; the granular engine is a native
graph: two `DelayNode`s modulated by out-of-phase sawtooth LFOs, crossfaded
by a triangle LFO, window length `windowSize` (default 0.1 s). Latency
`round(windowSize * sampleRate)`.

## Part 3 — worklet effects

### 3.1 Dynamics core (`dynamics.worklet.ts`)

One `AudioWorkletProcessor` `audiorective-dynamics`, stereo-linked (detector
= max over channels), feedforward:

- lookahead ring buffer of `lookahead` seconds (fixed at construction via
  `processorOptions`, since changing it changes latency); with lookahead the
  detector reads the peak over the whole window, so a transient is seen
  before it leaves the delay;
- one-pole attack/release smoothing of the gain reduction in the log domain
  (Giannoulis, Massberg, Reiss 2012);
- gain computer: threshold, ratio (`Infinity` allowed), soft knee width;
- makeup gain;
- posts `reduction` (dB, negative) to the main thread every ~50 ms.

AudioParams (all k-rate, bound to `SchedulableParam`s): `threshold` (dB),
`ratio`, `knee` (dB), `attack` (s), `release` (s), `makeup` (dB).

### 3.2 Compressor

`Compressor(ctx, { threshold = -24, ratio = 4, knee = 6, attack = 0.003, release = 0.25, makeup = 0, lookahead = 0 })`

Params: the six above as `SchedulableParam`s. Cells: `reduction: Cell<number>`.
Latency: `round(lookahead * sampleRate)`. Constructing awaits nothing — the
node is created after `registerWorklet` resolves; until then the wet arm is
silent and `cells.isReady` is false. `ready: Promise<void>` resolves when the
worklet node is live.

### 3.3 Limiter

`Limiter(ctx, { threshold = -1, release = 0.05, lookahead = 0.005 })`

Same core with `ratio = Infinity`, `knee = 0`, `attack = 0.001`; the
windowed peak detector, not the attack, is what keeps the output under the
threshold (the 1 ms attack only rounds the onset of gain reduction).
Params: `threshold`, `release`. Cells: `reduction`. Latency
`round(lookahead * sampleRate)` (≈ 221 samples at 44.1 kHz for the default).

### 3.4 PitchShift

`PitchShift(ctx, { pitch = 0, engine = "granular", windowSize = 0.1, stretch?: { tonalityHz?, formantCompensation?, formantSemitones?, blockMs? } })`

| Param   | Kind            | Notes                                        |
| ------- | --------------- | -------------------------------------------- |
| `pitch` | `Param<number>` | semitones, fractional allowed; range −24..24 |

Cells: `isReady: Cell<boolean>` (granular: true immediately).

- **granular**: Part 2.7. `pitch` recomputes the LFO frequencies as Tone
  does. Latency `windowSize` in samples.
- **stretch**: wraps `SignalsmithStretch(ctx)` in live-input mode. The
  processor constructs synchronously with the wet arm silent; on resolve it
  connects the node, calls `start()`, applies `pitch` via
  `schedule({ semitones })`, sets `isReady`, and sets its `latency`
  `Param<number>` from `node.latency()`. `pitch` writes call `schedule()`
  again. `blockMs` passes through `configure()`; default is the library's
  (120 ms); tmc-cl1's rack will likely set 40–60 ms.

Both engines share `wet` and `pitch`, so a consumer switches engine per
instance without changing calling code.

## Part 4 — Channel and SendBus

### 4.1 Channel

`Channel(ctx, { gain = 1, pan = 0, mute = false, channelCount = 2 })`

| Param  | Kind                       | Notes                                     |
| ------ | -------------------------- | ----------------------------------------- |
| `gain` | `SchedulableParam` (0..∞)  | bound to the strip's `GainNode.gain`      |
| `pan`  | `SchedulableParam` (−1..1) | bound to `StereoPannerNode.pan`           |
| `mute` | `Param<boolean>`           | a separate `GainNode` at 0/1 after `gain` |

`input → gain → pan → mute → output`. `channelCount` sets
`channelCountMode: "explicit"` on the input so mono sources come out stereo.
Latency 0.

`channel.send(bus, name, gain = 1): Send` taps the post-mute signal into the
bus's named receive through a `GainNode`; `Send.gain` is a `SchedulableParam`
and `Send.dispose()` removes it. Sends are tracked and disposed with the
channel.

### 4.2 SendBus

```typescript
const bus = new SendBus(ctx);
bus.define("hall"); // creates a GainNode receive point
bus.receive("hall"): GainNode; // connect an effect's input here
bus.destroy();
```

Purely a named map of `GainNode`s; no global state. Consumers hold one bus
per rack.

## Part 5 — `renderOffline` (core)

```typescript
renderOffline(
  options: { seconds: number; channels?: number; sampleRate?: number },
  setup: (ctx: OfflineAudioContext) => void | Promise<void>,
): Promise<AudioBuffer>;
```

Builds the `OfflineAudioContext`, awaits `setup` (which may construct
worklet-backed processors and `await proc.ready`), then
`startRendering()`. Documented in `docs/core.md` under Sound Playback.
`Sampler`/`BufferPlayer` already accept `BaseAudioContext`.

## Part 6 — documentation and skill

- `docs/effects.md`: contract, per-effect tables (as above), PitchShift
  engine choice guide, dynamics defaults, Channel/SendBus, an FX-rack example
  (inserts in series into a bus with two sends) and an offline export
  example.
- Skill: `references/effects.md` mirroring the doc; `SKILL.md` gains a row
  in the packages table and a "building an FX rack / replacing Tone.js
  effects" routing line.
- `CHANGELOG.md` Unreleased: new package, `renderOffline`.
- `docs/authoring-processors.md` gains a short worklet-loader section
  pointing at `registerWorklet`.

## Part 7 — tests (vitest browser mode, headless Chromium)

Signal-property tests through `OfflineAudioContext`, no golden WAVs in the
library:

- **wetDry**: `wet = 0` passes the input bit-exact; `wet = 1` passes only the
  effect arm; a linear ramp yields the expected mid-point mix.
- **Filter**: lowpass at 1 kHz attenuates a 4 kHz sine by ≥ 12 dB per stage
  configured; `rolloff` stacks.
- **Distortion**: output RMS of a full-scale sine rises with `distortion`;
  `distortion = 0` is unity within 1e-6.
- **Phaser**: with `frequency = 0` the output spectrum has `stages/2` notches;
  with LFO running, spectral centroid varies over time.
- **FrequencyShifter**: a 440 Hz sine with `frequency = 100` peaks at 540 Hz
  and the 340 Hz sideband is ≥ 30 dB down; negative shifts mirror.
- **PingPongDelay**: an impulse produces echoes alternating L/R at
  `delayTime` spacing with `feedback` decay.
- **Convolver**: a unit-impulse IR is identity; `isReady` flips on load.
- **Compressor**: a −6 dBFS sine above a −24 dB threshold at ratio 4 settles
  to the gain-computer value ± 0.1 dB; `reduction` cell reports it.
- **Limiter**: white noise at +6 dBFS never exceeds `threshold` after the
  lookahead; peak measured over the render.
- **PitchShift**: both engines move a 440 Hz sine's dominant FFT bin by
  `pitch` semitones ± one bin; `isReady` resolves for stretch.
- **Channel/SendBus**: `mute` silences; a send at `gain 0.5` delivers half
  amplitude to the receive.
- **Latency**: `assertLatency` from `@audiorective/devtools` on every
  processor at 44.1 k and 48 k.
- **registerWorklet**: two concurrent registrations share one `addModule`.
- **renderOffline**: renders a `Sampler` hit through `Limiter` and returns a
  buffer of the requested length.

## Part 8 — showroom demo: FX Rack

Route `/showroom/fx-rack`, source `apps/web/src/demos/fx-rack`, listed in
`apps/web/src/data/demos.ts` with packages `@audiorective/effects`,
`@audiorective/core`, `@audiorective/react`. Follows the sequencer demo's
shape: a headless `audio/FxRack.ts` processor, `audio/engine.ts`, a React
observer layer under `ui/`, an island entry `FxRackApp.tsx`, a README.

**What it plays.** The existing `public/stems/drums.mp3` looped on a
`BufferPlayer`, plus four pads on `Sampler`s using the synthesized kit from
`demos/sequencer/audio/drumKit.ts`, both summed into one `Channel`.

**Signal path.** `Channel → PitchShift → Filter → FrequencyShifter →
Distortion → Phaser → Compressor → Limiter → destination`, with two sends off
the channel into a `SendBus`: `PingPongDelay` and `Convolver` (IR synthesized
procedurally: exponentially decaying noise, 2 s, so no binary asset). Both
returns feed the Compressor input.

**What it demonstrates.**

1. Every insert has a `wet` fader and its main control; bypass is `wet = 0`
   and the module stays lit, showing the no-disconnect contract.
2. PitchShift has an engine toggle (`granular` / `stretch`) on the same
   `pitch` knob; the module shows `latency` from the processor and the
   rack's total path latency from `engine.core.getPathLatency`, so switching
   engines visibly changes the number and PDC keeps the sends aligned.
3. Compressor and Limiter draw `cells.reduction` as gain-reduction meters.
4. "Export 4 bars" calls `renderOffline` with the same `FxRack` class against
   an `OfflineAudioContext`, encodes WAV in the browser, and offers a download.
   The same class in both contexts is the point.
5. The whole rack is one `defineGraph` in `FxRack`; a small graph readout
   (from `GraphHandle.snapshot()`) lists nodes and compensation samples.

**Tests** (`apps/web/tests/fx-rack`): `FxRack` constructs against an
`OfflineAudioContext`, renders one bar, and asserts the output is non-silent,
peaks under the limiter threshold, and that `wet = 0` on every insert
reproduces the dry sum within 1e-4. No UI tests beyond the existing
screenshot convention if the demo pages already have one.

**Aesthetic.** Dark rack of modules with neon accents, monospace readouts,
consistent with the other showroom pages; apply the `frontend-design` skill.

## Phasing

1. Package scaffold, `wetDry`, `registerWorklet`, dB helpers, `Channel`,
   `SendBus`, `Filter`, `Distortion`, `PingPongDelay`, `Convolver`.
2. `Phaser`, `FrequencyShifter`, granular `PitchShift`.
3. Dynamics worklet, `Compressor`, `Limiter`, `renderOffline` in core.
4. Stretch `PitchShift` engine.
5. Docs, skill reference, changelog.
6. FX Rack showroom demo.

## Out of scope

- Modelled-hardware compressors (VCA/FET/opto modes), Chorus, Tremolo,
  algorithmic reverb, a Tone-compatible `set()` API, tempo-synced delay
  values, phaser feedback, delay damping.
- Pad-player gaps in core (`Sampler` reverse, retrigger fade-out, schedulable
  per-voice volume). Needed for tmc-cl1's pads; separate spec.
- tmc-cl1's own migration.

## Appendix — tmc-cl1 mapping

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
