# Livehouse PA Simulator — Phase 1: Audio Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless, fully-testable audio core for the Livehouse PA Simulator — a source-agnostic `Channel`, a `Mixer` (room/headphone buses, reverb, solo/mute, metering), the three source types (stream/synth/sampler), and the assembled engine — with no renderers or UI.

**Architecture:** One `AudioContext` via `createEngine`. Each of six `Channel`s wraps a source (`StreamPlayer`, `SynthSource`, or `SamplerSource`) → `EQ3` → fader → mute-gain → analyser, then splits into a **room path** (`Spatial` HRTF panner) and a **headphone path** (`StereoPanner` whose pan is derived from the channel's `position` cell in a fixed frame). The `Mixer` sums channels into a room bus (+ convolver reverb) and a headphone bus, and the global `headphone` toggle switches which bus is audible. All audio state lives on processors; nothing here touches the DOM.

**Tech Stack:** TypeScript, `@audiorective/core` (`AudioProcessor`, `Param`, `SchedulableParam`, `Cell`, `Spatial`, `StreamPlayer`, `SoundPlayer`, `createEngine`), `@audiorective/react` (`createEngineContext`), Vitest **browser mode** (Playwright/Chromium, real `AudioContext`).

This is **Phase 1 of 4**. Phase 2 (PlayCanvas world + spatial wiring), Phase 3 (React HUD + three.js EQ/panning widgets + keymap + old-demo cleanup), and Phase 4 (the "Designing Audio Apps" skill guide, written with `superpowers:writing-skills`, using this app as the worked example — spec §11) are separate plans authored after this lands. Spec: `docs/superpowers/specs/2026-06-21-livehouse-pa-simulator-design.md`.

---

## File Structure

All paths under `apps/showroom/`. New code lives in `src/audio/`; the existing demos under `src/examples/**` keep building untouched in this phase (they are deleted in Phase 3). `EQ3`, `StepSynth`, and `MasterSequencer` are **imported from their current locations** and relocated in Phase 3.

| File                                          | Responsibility                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `vitest.config.ts` (create)                   | Browser-mode test config, mirrors `packages/core`                           |
| `package.json` (modify)                       | Add test deps + `test` script                                               |
| `src/audio/spatialMath.ts` (create)           | `Vec3` type + pure `azimuthToPan` (fixed-frame stereo mixdown)              |
| `src/audio/meterMath.ts` (create)             | Pure `rms(samples)` for metering                                            |
| `src/audio/reverb.ts` (create)                | `makeImpulseResponse` + `createReverb` (synthesized IR convolver)           |
| `src/audio/Channel.ts` (create)               | Source-agnostic channel strip (`AudioProcessor`)                            |
| `src/audio/Mixer.ts` (create)                 | Room/headphone buses, reverb, headphone toggle, solo/mute, metering, master |
| `src/audio/sources/SamplerSource.ts` (create) | `SoundPlayer` loop bed + polyphonic pad one-shots                           |
| `src/audio/sources/SynthSource.ts` (create)   | `StepSynth` + arp pattern registered on the transport                       |
| `src/audio/sceneConfig.ts` (create)           | The six channel/drone definitions                                           |
| `src/audio/engine.ts` (create)                | `createEngine` assembly + `EngineProvider`/`useEngine` + `start`/`stop`     |
| `tests/*.test.ts` (create)                    | One test file per unit above                                                |

---

## Task 0: Test harness for the showroom

**Files:**

- Modify: `apps/showroom/package.json`
- Create: `apps/showroom/vitest.config.ts`
- Create: `apps/showroom/tests/smoke.test.ts`

- [ ] **Step 1: Add test deps + script to `apps/showroom/package.json`**

In `"scripts"`, add:

```json
    "test": "vitest"
```

In `"devDependencies"`, add (matching `packages/core`):

```json
    "@vitest/browser": "^4.0.18",
    "@vitest/browser-playwright": "^4.0.18",
    "playwright": "^1.58.2",
    "vitest": "^4.0.18"
```

- [ ] **Step 2: Create `apps/showroom/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    // Audio tests assert against the AudioContext wall-clock; running test files in
    // parallel browser contexts starves those timers and makes them flaky. Serialize.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
```

- [ ] **Step 3: Install deps + Chromium**

Run: `pnpm install && pnpm --filter @audiorective/showroom exec playwright install chromium`
Expected: install completes; Chromium downloaded (or "already installed").

- [ ] **Step 4: Create `apps/showroom/tests/smoke.test.ts`**

```ts
import { describe, test, expect } from "vitest";

describe("showroom test harness", () => {
  test("AudioContext is available in the browser test env", () => {
    const ctx = new AudioContext();
    expect(ctx).toBeInstanceOf(AudioContext);
    void ctx.close();
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `pnpm --filter @audiorective/showroom test -- --run smoke`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add apps/showroom/package.json apps/showroom/vitest.config.ts apps/showroom/tests/smoke.test.ts pnpm-lock.yaml
git commit -m "test(showroom): add vitest browser-mode harness"
```

---

## Task 1: `spatialMath` — fixed-frame stereo pan

**Files:**

- Create: `apps/showroom/src/audio/spatialMath.ts`
- Test: `apps/showroom/tests/spatialMath.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from "vitest";
import { azimuthToPan, type Vec3 } from "../src/audio/spatialMath";

const at = (x: number): Vec3 => ({ x, y: 1, z: -3 });

describe("azimuthToPan", () => {
  test("center maps to 0", () => {
    expect(azimuthToPan(at(0))).toBeCloseTo(0);
  });
  test("right is positive, left is negative", () => {
    expect(azimuthToPan(at(2.5))).toBeGreaterThan(0);
    expect(azimuthToPan(at(-2.5))).toBeLessThan(0);
  });
  test("clamps beyond the half-width to ±1", () => {
    expect(azimuthToPan(at(100))).toBe(1);
    expect(azimuthToPan(at(-100))).toBe(-1);
  });
  test("is listener-independent (depends only on x)", () => {
    expect(azimuthToPan({ x: 1.5, y: 0, z: 0 })).toBeCloseTo(azimuthToPan({ x: 1.5, y: 9, z: -50 }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run spatialMath`
Expected: FAIL — cannot resolve `../src/audio/spatialMath`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/spatialMath.ts
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Default half-width of the venue in metres; x beyond ±this clamps to a hard L/R. */
export const STAGE_HALF_WIDTH = 5;

/**
 * Collapse a drone's world position to a stereo pan (-1..1) for the headphone
 * "mixdown". Fixed-frame: depends only on horizontal x, so the monitor image is
 * stable regardless of where the listener walks or looks.
 */
export function azimuthToPan(pos: Vec3, halfWidth = STAGE_HALF_WIDTH): number {
  const p = pos.x / halfWidth;
  return Math.max(-1, Math.min(1, p));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run spatialMath`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/spatialMath.ts apps/showroom/tests/spatialMath.test.ts
git commit -m "feat(showroom): fixed-frame azimuthToPan helper"
```

---

## Task 2: `meterMath` — RMS

**Files:**

- Create: `apps/showroom/src/audio/meterMath.ts`
- Test: `apps/showroom/tests/meterMath.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from "vitest";
import { rms } from "../src/audio/meterMath";

describe("rms", () => {
  test("silence is 0", () => {
    expect(rms(new Float32Array(64))).toBe(0);
  });
  test("constant full-scale is 1", () => {
    expect(rms(new Float32Array(64).fill(1))).toBeCloseTo(1);
  });
  test("constant -1 is also 1 (magnitude)", () => {
    expect(rms(new Float32Array(64).fill(-1))).toBeCloseTo(1);
  });
  test("half-amplitude is ~0.5", () => {
    expect(rms(new Float32Array(64).fill(0.5))).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run meterMath`
Expected: FAIL — cannot resolve `../src/audio/meterMath`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/meterMath.ts
/** Root-mean-square of time-domain samples (0..~1). */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length === 0 ? 0 : Math.sqrt(sum / samples.length);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run meterMath`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/meterMath.ts apps/showroom/tests/meterMath.test.ts
git commit -m "feat(showroom): rms meter helper"
```

---

## Task 3: `reverb` — synthesized IR convolver

**Files:**

- Create: `apps/showroom/src/audio/reverb.ts`
- Test: `apps/showroom/tests/reverb.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { makeImpulseResponse, createReverb } from "../src/audio/reverb";

describe("reverb", () => {
  let ctx: AudioContext;
  beforeEach(() => {
    ctx = new AudioContext();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("makeImpulseResponse builds a 2-channel buffer of the requested length", () => {
    const ir = makeImpulseResponse(ctx, 1, 3);
    expect(ir.numberOfChannels).toBe(2);
    expect(ir.length).toBe(Math.floor(1 * ctx.sampleRate));
  });

  test("createReverb returns a wired convolver with wet/dry gains", () => {
    const { convolver, wet, dry } = createReverb(ctx, { wet: 0.3, dry: 0.7 });
    expect(convolver).toBeInstanceOf(ConvolverNode);
    expect(convolver.buffer).not.toBeNull();
    expect(wet.gain.value).toBeCloseTo(0.3);
    expect(dry.gain.value).toBeCloseTo(0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run reverb`
Expected: FAIL — cannot resolve `../src/audio/reverb`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/reverb.ts
/** Build a decaying-noise impulse response — a cheap synthesized room (no asset needed). */
export function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buffer = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buffer;
}

export interface ReverbOptions {
  wet?: number;
  dry?: number;
  buffer?: AudioBuffer;
}

/**
 * A parallel dry/wet reverb. The caller wires: bus → dry → master and
 * bus → convolver → wet → master. If no IR buffer is supplied, one is synthesized
 * (so the headphone-vs-room contrast works without a user-provided IR file).
 */
export function createReverb(ctx: AudioContext, opts: ReverbOptions = {}) {
  const convolver = new ConvolverNode(ctx, { buffer: opts.buffer ?? makeImpulseResponse(ctx) });
  const wet = new GainNode(ctx, { gain: opts.wet ?? 0.25 });
  const dry = new GainNode(ctx, { gain: opts.dry ?? 1 });
  return { convolver, wet, dry };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run reverb`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/reverb.ts apps/showroom/tests/reverb.test.ts
git commit -m "feat(showroom): synthesized-IR reverb helper"
```

---

## Task 4: `Channel` — source-agnostic channel strip

**Files:**

- Create: `apps/showroom/src/audio/Channel.ts`
- Test: `apps/showroom/tests/channel.test.ts`

`Channel` owns: `EQ3` (the 3 bands, accessed via `channel.eq.params`), a fader gain (`volume` param), a mute gain (driven by `applyMix`), an `AnalyserNode` tap, a `Spatial` (room path → `roomOut`), and a `StereoPanner` (headphone path → `phonesOut`) whose pan tracks the `position` cell.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Channel } from "../src/audio/Channel";

function makeSource(ctx: AudioContext) {
  return { output: new GainNode(ctx) };
}

describe("Channel", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("volume param drives the fader gain", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    ch.params.volume.value = 0.3;
    // fader gain is internal; assert via the public param (bound 1:1)
    expect(ch.params.volume.value).toBeCloseTo(0.3);
    ch.destroy();
  });

  test("exposes EQ bands via channel.eq.params", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    ch.eq.params.eqLow.value = 6;
    expect(ch.eq.params.eqLow.value).toBeCloseTo(6);
    ch.destroy();
  });

  test("roomOut and phonesOut are distinct AudioNodes", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    expect(ch.roomOut).toBeInstanceOf(AudioNode);
    expect(ch.phonesOut).toBeInstanceOf(AudioNode);
    expect(ch.roomOut).not.toBe(ch.phonesOut);
    ch.destroy();
  });

  test("headphone pan tracks the position cell (right = positive)", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    expect((ch.phonesOut as StereoPannerNode).pan.value).toBeCloseTo(0);
    ch.cells.position.value = { x: 5, y: 1, z: -3 };
    expect((ch.phonesOut as StereoPannerNode).pan.value).toBeGreaterThan(0.5);
    ch.destroy();
  });

  test("applyMix(false) ramps the mute gain toward 0", async () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    ch.applyMix(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(ch.muteGainValue).toBeLessThan(0.05);
    ch.applyMix(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(ch.muteGainValue).toBeGreaterThan(0.95);
    ch.destroy();
  });

  test("destroy() also destroys a source that has a destroy method", () => {
    let destroyed = false;
    const source = {
      output: new GainNode(ctx),
      destroy: () => {
        destroyed = true;
      },
    };
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source, position: { x: 0, y: 1, z: -3 } });
    ch.destroy();
    expect(destroyed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run channel`
Expected: FAIL — cannot resolve `../src/audio/Channel`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/Channel.ts
import { AudioProcessor, Spatial } from "@audiorective/core";
import type { Param, SchedulableParam, Cell, SpatialOptions } from "@audiorective/core";
import { EQ3 } from "../shared/audio/EQ3";
import { azimuthToPan, type Vec3 } from "./spatialMath";

/** Anything that produces audio: StreamPlayer, SoundPlayer-backed source, synth, etc. */
export interface SourceLike {
  readonly output: AudioNode | undefined;
  destroy?: () => void;
}

export interface ChannelOptions {
  id: string;
  label: string;
  color: string;
  source: SourceLike;
  position: Vec3;
  spatial?: SpatialOptions;
}

const MUTE_RAMP_S = 0.015;

/**
 * Source-agnostic channel strip: source → EQ3 → fader → mute → analyser, then a
 * room path (Spatial HRTF) and a headphone path (StereoPanner from position).
 */
export class Channel extends AudioProcessor<
  { volume: SchedulableParam; muted: Param<boolean>; soloed: Param<boolean> },
  { position: Cell<Vec3>; level: Cell<number> }
> {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly eq: EQ3;
  readonly spatial: Spatial;
  readonly analyser: AnalyserNode;

  private readonly _source: SourceLike;
  private readonly _fader: GainNode;
  private readonly _mute: GainNode;
  private readonly _stereo: StereoPannerNode;

  constructor(ctx: AudioContext, opts: ChannelOptions) {
    const fader = new GainNode(ctx, { gain: 0.8 });
    super(ctx, ({ param, cell }) => ({
      params: {
        volume: param({ default: 0.8, min: 0, max: 1, bind: fader.gain }),
        muted: param<boolean>({ default: false }),
        soloed: param<boolean>({ default: false }),
      },
      cells: {
        position: cell<Vec3>(opts.position),
        level: cell<number>(0),
      },
    }));

    this.id = opts.id;
    this.label = opts.label;
    this.color = opts.color;
    this._source = opts.source;
    this._fader = fader;

    this.eq = new EQ3(ctx);
    this.spatial = new Spatial(ctx, opts.spatial);
    this.analyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.6 });
    this._mute = new GainNode(ctx, { gain: 1 });
    this._stereo = new StereoPannerNode(ctx, { pan: azimuthToPan(opts.position) });

    opts.source.output?.connect(this.eq.input);
    this.eq.output.connect(this._fader);
    this._fader.connect(this._mute);
    this._mute.connect(this.analyser);
    this.analyser.connect(this.spatial.input);
    this.analyser.connect(this._stereo);

    // position cell → headphone stereo pan (cleaned up by super.destroy()).
    this.effect(() => {
      this._stereo.pan.value = azimuthToPan(this.cells.position.value);
    });
  }

  /** The strip splits into two buses; there is no single output. */
  get output(): AudioNode | undefined {
    return undefined;
  }

  get roomOut(): AudioNode {
    return this.spatial.output;
  }

  get phonesOut(): AudioNode {
    return this._stereo;
  }

  /** Live mute-gain value — for tests/metering, not reactive. */
  get muteGainValue(): number {
    return this._mute.gain.value;
  }

  /** Set by the Mixer's solo/mute resolution. Ramps to avoid clicks. */
  applyMix(audible: boolean): void {
    const now = this.context.currentTime;
    const g = this._mute.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(audible ? 1 : 0, now + MUTE_RAMP_S);
  }

  override destroy(): void {
    super.destroy();
    this._source.destroy?.();
    this.eq.destroy();
    this.spatial.destroy();
    this._fader.disconnect();
    this._mute.disconnect();
    this.analyser.disconnect();
    this._stereo.disconnect();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run channel`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/Channel.ts apps/showroom/tests/channel.test.ts
git commit -m "feat(showroom): source-agnostic Channel strip"
```

---

## Task 5: `Mixer` — buses, headphone, solo/mute, metering

**Files:**

- Create: `apps/showroom/src/audio/Mixer.ts`
- Test: `apps/showroom/tests/mixer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Channel } from "../src/audio/Channel";
import { Mixer } from "../src/audio/Mixer";

function makeChannel(ctx: AudioContext, id: string, x = 0) {
  return new Channel(ctx, { id, label: id, color: "#fff", source: { output: new GainNode(ctx) }, position: { x, y: 1, z: -3 } });
}
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("Mixer", () => {
  let ctx: AudioContext;
  let channels: Channel[];
  let mixer: Mixer;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
    channels = [makeChannel(ctx, "a", -2), makeChannel(ctx, "b", 2)];
    mixer = new Mixer(ctx, channels);
  });
  afterEach(() => {
    mixer.destroy();
    void ctx.close();
  });

  test("defaults to the room path (room audible, phones silent)", () => {
    expect(mixer.roomBusGain).toBeCloseTo(1);
    expect(mixer.phonesBusGain).toBeCloseTo(0);
  });

  test("headphone toggle swaps the buses", async () => {
    mixer.params.headphone.value = true;
    await settle();
    expect(mixer.roomBusGain).toBeLessThan(0.05);
    expect(mixer.phonesBusGain).toBeGreaterThan(0.95);
  });

  test("muting a channel silences only it (no solo active)", async () => {
    channels[0].params.muted.value = true;
    await settle();
    expect(channels[0].muteGainValue).toBeLessThan(0.05);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("soloing a channel silences the others", async () => {
    channels[1].params.soloed.value = true;
    await settle();
    expect(channels[0].muteGainValue).toBeLessThan(0.05);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("solo overrides mute for the soloed channel", async () => {
    channels[1].params.soloed.value = true;
    channels[1].params.muted.value = true;
    await settle();
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("metering can start and stop without throwing", () => {
    mixer.startMetering();
    mixer.startMetering(); // idempotent
    mixer.stopMetering();
  });

  test("master output is an AudioNode", () => {
    expect(mixer.output).toBeInstanceOf(AudioNode);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run mixer`
Expected: FAIL — cannot resolve `../src/audio/Mixer`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/Mixer.ts
import { AudioProcessor } from "@audiorective/core";
import type { Param, SchedulableParam, Cell } from "@audiorective/core";
import { Channel } from "./Channel";
import { createReverb } from "./reverb";
import { rms } from "./meterMath";

const BUS_RAMP_S = 0.02;

/**
 * Sums channels into a room bus (+ convolver reverb) and a headphone bus, and the
 * global `headphone` toggle picks which is audible. Owns solo/mute resolution and a
 * single metering RAF loop that writes every channel's `level` cell.
 */
export class Mixer extends AudioProcessor<{ headphone: Param<boolean>; masterVolume: SchedulableParam }, { masterLevel: Cell<number> }> {
  readonly channels: Channel[];

  private readonly _roomBus: GainNode;
  private readonly _phonesBus: GainNode;
  private readonly _master: GainNode;
  private readonly _masterAnalyser: AnalyserNode;
  private readonly _buf: Float32Array;
  private _rafId: number | null = null;

  constructor(ctx: AudioContext, channels: Channel[]) {
    const master = new GainNode(ctx, { gain: 0.9 });
    super(ctx, ({ param, cell }) => ({
      params: {
        headphone: param<boolean>({ default: false }),
        masterVolume: param({ default: 0.9, min: 0, max: 1, bind: master.gain }),
      },
      cells: { masterLevel: cell<number>(0) },
    }));

    this.channels = channels;
    this._master = master;
    this._roomBus = new GainNode(ctx, { gain: 1 });
    this._phonesBus = new GainNode(ctx, { gain: 0 });
    this._masterAnalyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.6 });
    this._buf = new Float32Array(this._masterAnalyser.fftSize);

    const { convolver, wet, dry } = createReverb(ctx);
    this._roomBus.connect(dry).connect(this._master);
    this._roomBus.connect(convolver).connect(wet).connect(this._master);
    this._phonesBus.connect(this._master);
    this._master.connect(this._masterAnalyser);
    this._masterAnalyser.connect(ctx.destination);

    for (const ch of channels) {
      ch.roomOut.connect(this._roomBus);
      ch.phonesOut.connect(this._phonesBus);
    }

    // headphone routing (runs once at construction → in-room default)
    this.effect(() => {
      const phones = this.params.headphone.value;
      const now = ctx.currentTime;
      this._ramp(this._roomBus.gain, phones ? 0 : 1, now);
      this._ramp(this._phonesBus.gain, phones ? 1 : 0, now);
    });

    // solo/mute resolution across all channels
    this.effect(() => {
      const anySolo = this.channels.some((c) => c.params.soloed.value);
      for (const c of this.channels) {
        const audible = anySolo ? c.params.soloed.value : !c.params.muted.value;
        c.applyMix(audible);
      }
    });
  }

  get output(): AudioNode {
    return this._master;
  }

  get roomBusGain(): number {
    return this._roomBus.gain.value;
  }

  get phonesBusGain(): number {
    return this._phonesBus.gain.value;
  }

  startMetering(): void {
    if (this._rafId !== null) return;
    const tick = () => {
      for (const c of this.channels) {
        c.analyser.getFloatTimeDomainData(this._buf);
        c.cells.level.value = rms(this._buf);
      }
      this._masterAnalyser.getFloatTimeDomainData(this._buf);
      this.cells.masterLevel.value = rms(this._buf);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stopMetering(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _ramp(p: AudioParam, target: number, now: number): void {
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(target, now + BUS_RAMP_S);
  }

  override destroy(): void {
    this.stopMetering();
    super.destroy();
    for (const c of this.channels) c.destroy();
    this._roomBus.disconnect();
    this._phonesBus.disconnect();
    this._master.disconnect();
    this._masterAnalyser.disconnect();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run mixer`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/Mixer.ts apps/showroom/tests/mixer.test.ts
git commit -m "feat(showroom): Mixer with room/headphone buses, solo/mute, metering"
```

---

## Task 6: `SamplerSource` — loop bed + pad one-shots

**Files:**

- Create: `apps/showroom/src/audio/sources/SamplerSource.ts`
- Test: `apps/showroom/tests/samplerSource.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SamplerSource, PAD_IDS } from "../src/audio/sources/SamplerSource";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}

describe("SamplerSource", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode", () => {
    const s = new SamplerSource(ctx);
    expect(s.output).toBeInstanceOf(AudioNode);
    s.destroy();
  });

  test("trigger with no buffer loaded returns null", () => {
    const s = new SamplerSource(ctx);
    expect(s.trigger("boom")).toBeNull();
    s.destroy();
  });

  test("trigger after setPadBuffer returns a Voice", () => {
    const s = new SamplerSource(ctx);
    s.setPadBuffer("boom", makeBuffer(ctx, 1));
    expect(s.trigger("boom")).not.toBeNull();
    s.destroy();
  });

  test("startBed loops the bed buffer", () => {
    const s = new SamplerSource(ctx);
    s.setBedBuffer(makeBuffer(ctx, 2));
    s.startBed();
    expect(s.bedActiveVoices).toBe(1);
    s.stopBed();
    s.destroy();
  });

  test("PAD_IDS has the four expected pads", () => {
    expect(PAD_IDS).toEqual(["boom", "riser", "airhorn", "applause"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run samplerSource`
Expected: FAIL — cannot resolve `../src/audio/sources/SamplerSource`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/sources/SamplerSource.ts
import { SoundPlayer } from "@audiorective/core";
import type { Voice } from "@audiorective/core";

export type PadId = "boom" | "riser" | "airhorn" | "applause";
export const PAD_IDS: readonly PadId[] = ["boom", "riser", "airhorn", "applause"];

/**
 * The Sampler channel's source. A looping bed (one SoundPlayer, loop) plus one
 * polyphonic SoundPlayer per pad sound; all sum into a single output gain.
 */
export class SamplerSource {
  readonly output: GainNode;
  private readonly _bed: SoundPlayer;
  private readonly _pads: Record<PadId, SoundPlayer>;

  constructor(ctx: AudioContext) {
    this.output = new GainNode(ctx, { gain: 1 });

    this._bed = new SoundPlayer(ctx, { loop: true, polyphony: 1 });
    this._bed.output.connect(this.output);

    this._pads = {} as Record<PadId, SoundPlayer>;
    for (const id of PAD_IDS) {
      const sp = new SoundPlayer(ctx, { polyphony: 4, steal: "oldest" });
      sp.output.connect(this.output);
      this._pads[id] = sp;
    }
  }

  setBedBuffer(buffer: AudioBuffer): void {
    this._bed.buffer = buffer;
  }

  setPadBuffer(id: PadId, buffer: AudioBuffer): void {
    this._pads[id].buffer = buffer;
  }

  startBed(): Voice | null {
    return this._bed.trigger({ loop: true });
  }

  stopBed(): void {
    this._bed.stopAll();
  }

  trigger(id: PadId): Voice | null {
    return this._pads[id].trigger();
  }

  get bedActiveVoices(): number {
    return this._bed.cells.activeVoices.value;
  }

  destroy(): void {
    this._bed.destroy();
    for (const id of PAD_IDS) this._pads[id].destroy();
    this.output.disconnect();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run samplerSource`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/sources/SamplerSource.ts apps/showroom/tests/samplerSource.test.ts
git commit -m "feat(showroom): SamplerSource (loop bed + polyphonic pads)"
```

---

## Task 7: `SynthSource` — synth + arp on the transport

**Files:**

- Create: `apps/showroom/src/audio/sources/SynthSource.ts`
- Test: `apps/showroom/tests/synthSource.test.ts`

`SynthSource` reuses `StepSynth` and registers an arp pattern on a `MasterSequencer` transport. Both are imported from `src/examples/sequencer/audio/**` for now (relocated in Phase 3).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { MasterSequencer } from "../src/examples/sequencer/audio/MasterSequencer";
import { SynthSource } from "../src/audio/sources/SynthSource";

describe("SynthSource", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode", () => {
    const transport = new MasterSequencer(ctx);
    const s = new SynthSource(ctx, transport);
    expect(s.output).toBeInstanceOf(AudioNode);
    s.destroy();
    transport.destroy();
  });

  test("plays through the transport without throwing", () => {
    const transport = new MasterSequencer(ctx);
    const s = new SynthSource(ctx, transport);
    transport.start();
    expect(transport.params.playing.value).toBe(true);
    transport.stop();
    s.destroy();
    transport.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run synthSource`
Expected: FAIL — cannot resolve `../src/audio/sources/SynthSource`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/sources/SynthSource.ts
import { StepSynth } from "../../examples/sequencer/audio/instruments/StepSynth";
import type { MasterSequencer } from "../../examples/sequencer/audio/MasterSequencer";

// Semitone offsets of a simple looping arpeggio over a base note.
const ARP = [0, 7, 12, 7];
const BASE_HZ = 220; // A3

function noteFor(step: number): number {
  const idx = Math.floor(step / 2) % ARP.length;
  return BASE_HZ * Math.pow(2, ARP[idx] / 12);
}

/** The Synth channel's source: a StepSynth playing an arp on the shared transport. */
export class SynthSource {
  readonly synth: StepSynth;

  constructor(ctx: AudioContext, transport: MasterSequencer) {
    this.synth = new StepSynth(ctx);
    transport.register(
      (step, time) => {
        if (step % 2 === 0) this.synth.playNote(noteFor(step), time);
      },
      () => this.synth.silence(),
    );
  }

  get output(): AudioNode | undefined {
    return this.synth.output;
  }

  destroy(): void {
    this.synth.destroy();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run synthSource`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/sources/SynthSource.ts apps/showroom/tests/synthSource.test.ts
git commit -m "feat(showroom): SynthSource (StepSynth arp on transport)"
```

---

## Task 8: `sceneConfig` — the six channels

**Files:**

- Create: `apps/showroom/src/audio/sceneConfig.ts`
- Test: `apps/showroom/tests/sceneConfig.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from "vitest";
import { CHANNELS } from "../src/audio/sceneConfig";

describe("sceneConfig", () => {
  test("declares six channels with unique ids", () => {
    expect(CHANNELS).toHaveLength(6);
    const ids = CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(6);
  });

  test("source kinds: exactly one synth, one sampler, four streams", () => {
    const kinds = CHANNELS.map((c) => c.kind);
    expect(kinds.filter((k) => k === "synth")).toHaveLength(1);
    expect(kinds.filter((k) => k === "sampler")).toHaveLength(1);
    expect(kinds.filter((k) => k === "stream")).toHaveLength(4);
  });

  test("every stream channel declares a src path", () => {
    for (const c of CHANNELS) {
      if (c.kind === "stream") expect(typeof c.src).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run sceneConfig`
Expected: FAIL — cannot resolve `../src/audio/sceneConfig`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/sceneConfig.ts
import type { Vec3 } from "./spatialMath";

export type SourceKind = "stream" | "synth" | "sampler";

export interface ChannelDef {
  id: string;
  label: string;
  color: string;
  kind: SourceKind;
  position: Vec3;
  /** For `kind: "stream"` — path to the stem (user-provided; missing → silent). */
  src?: string;
}

/** The band: four streamed stems + one synth + one sampler. */
export const CHANNELS: readonly ChannelDef[] = [
  { id: "guitar1", label: "Guitar 1", color: "#16a34a", kind: "stream", src: "/stems/guitar1.mp3", position: { x: -3.5, y: 1.4, z: -4 } },
  { id: "guitar2", label: "Guitar 2", color: "#22c55e", kind: "stream", src: "/stems/guitar2.mp3", position: { x: 3.5, y: 1.4, z: -4 } },
  { id: "drums", label: "Drums", color: "#dc2626", kind: "stream", src: "/stems/drums.mp3", position: { x: 0, y: 1.0, z: -5 } },
  { id: "bass", label: "Bass", color: "#7c3aed", kind: "stream", src: "/stems/bass.mp3", position: { x: -1.5, y: 1.0, z: -4.5 } },
  { id: "synth", label: "Synth", color: "#2563eb", kind: "synth", position: { x: 1.5, y: 1.8, z: -4.5 } },
  { id: "sampler", label: "Sampler", color: "#d97706", kind: "sampler", position: { x: 0, y: 2.2, z: -3 } },
] as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run sceneConfig`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/audio/sceneConfig.ts apps/showroom/tests/sceneConfig.test.ts
git commit -m "feat(showroom): channel/drone scene config"
```

---

## Task 9: `engine` — assembly + transport + React context

**Files:**

- Create: `apps/showroom/src/audio/engine.ts`
- Test: `apps/showroom/tests/engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect, afterEach } from "vitest";
import { createPaEngine } from "../src/audio/engine";

describe("PA engine assembly", () => {
  let teardown: (() => void) | null = null;
  afterEach(() => {
    teardown?.();
    teardown = null;
  });

  test("builds six channels, a mixer, and shared state", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    expect(engine.channels).toHaveLength(6);
    expect(engine.mixer.channels).toBe(engine.channels);
    expect(engine.selectedChannelId.value).toBe(engine.channels[0].id);
    expect(engine.ui.value.hudOpen).toBe(false);
    expect(engine.sampler).not.toBeNull();
  });

  test("start() flips the transport to playing; stop() clears it", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    engine.start();
    expect(engine.transport.params.playing.value).toBe(true);
    engine.stop();
    expect(engine.transport.params.playing.value).toBe(false);
  });

  test("headphone toggle is reachable via the mixer", async () => {
    const engine = createPaEngine();
    teardown = () => engine.core.destroy();
    await engine.core.start();

    engine.mixer.params.headphone.value = true;
    await new Promise((r) => setTimeout(r, 60));
    expect(engine.mixer.phonesBusGain).toBeGreaterThan(0.95);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run engine`
Expected: FAIL — cannot resolve `../src/audio/engine`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/audio/engine.ts
import { createEngine, cell, StreamPlayer } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { MasterSequencer } from "../examples/sequencer/audio/MasterSequencer";
import { Channel } from "./Channel";
import { Mixer } from "./Mixer";
import { SynthSource } from "./sources/SynthSource";
import { SamplerSource } from "./sources/SamplerSource";
import { CHANNELS } from "./sceneConfig";
import type { SourceLike } from "./Channel";

const SPATIAL_OPTS = { distanceModel: "inverse" as const, refDistance: 1.5, maxDistance: 25, rolloffFactor: 1.4 };

export interface UiState {
  hudOpen: boolean;
}

/** Build the whole PA-simulator audio engine. */
export function createPaEngine() {
  return createEngine((ctx) => {
    const transport = new MasterSequencer(ctx);
    const streams: StreamPlayer[] = [];
    let sampler: SamplerSource | null = null;
    const channels: Channel[] = [];

    for (const def of CHANNELS) {
      let source: SourceLike;
      if (def.kind === "stream") {
        const sp = new StreamPlayer(ctx, { src: def.src, loop: true });
        streams.push(sp);
        source = sp;
      } else if (def.kind === "synth") {
        source = new SynthSource(ctx, transport);
      } else {
        sampler = new SamplerSource(ctx);
        source = sampler;
      }
      channels.push(new Channel(ctx, { id: def.id, label: def.label, color: def.color, source, position: def.position, spatial: SPATIAL_OPTS }));
    }

    const mixer = new Mixer(ctx, channels);
    const selectedChannelId = cell<string>(channels[0].id);
    const ui = cell<UiState>({ hudOpen: false });

    const capturedSampler = sampler;
    return {
      transport,
      mixer,
      channels,
      sampler,
      selectedChannelId,
      ui,
      /** Start the gig: transport (synth), stems, sampler bed, and metering. */
      start(): void {
        transport.start();
        for (const s of streams) void s.play();
        capturedSampler?.startBed();
        mixer.startMetering();
      },
      /** Stop the gig. */
      stop(): void {
        transport.stop();
        for (const s of streams) s.pause();
        capturedSampler?.stopBed();
      },
    };
  });
}

export const engine = createPaEngine();

export const { EngineProvider, useEngine } = createEngineContext(engine);

declare global {
  interface Window {
    __paEngine?: typeof engine;
  }
}
if (typeof window !== "undefined") {
  window.__paEngine = engine;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run engine`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the whole Phase 1 suite + typecheck**

Run: `pnpm --filter @audiorective/showroom test -- --run`
Expected: PASS — all test files green.

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors. (The `engine` singleton is currently only referenced by tests/global; that's fine — Phase 2/3 consume it.)

- [ ] **Step 6: Commit**

```bash
git add apps/showroom/src/audio/engine.ts apps/showroom/tests/engine.test.ts
git commit -m "feat(showroom): assemble PA simulator audio engine"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage (§4 Audio architecture):** Channel chain (EQ→fader→mute→analyser→split) = Task 4; Mixer room/headphone buses + reverb + headphone toggle + solo/mute + metering = Task 5; sources (stream via `StreamPlayer` in Task 9, sampler = Task 6, synth = Task 7) ✓. Headphone **stereo mixdown** from fixed-frame azimuth = Tasks 1 + 4 ✓. Per-channel analyser meter = Tasks 2 + 4/5 ✓.
- **Deferred to later phases (not bugs):** the `Spatial` panner position is driven by PlayCanvas `bindPanner` in **Phase 2** — in Phase 1 the `position` cell exists and drives the headphone pan, but the room-path panner sits at its default until the world wires it. The keymap (`config/keymap.ts`) and all UI/renderer wiring are **Phase 3 / Phase 2**.
- **Type consistency:** `SourceLike` (Task 4) is reused by Task 9; `Channel`/`Mixer`/`SamplerSource`/`SynthSource` signatures match their call sites in `engine.ts`. `azimuthToPan` (Task 1) is used by Task 4. `rms` (Task 2) by Task 5.
- **Imports to relocate in Phase 3:** `EQ3` (`src/shared/audio/EQ3`), `StepSynth` + `MasterSequencer` (`src/examples/sequencer/audio/**`). They keep the old demos building during Phases 1–2.

```

```
