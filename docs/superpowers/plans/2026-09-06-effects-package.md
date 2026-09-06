# `@audiorective/effects` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@audiorective/effects` (ten effect/strip processors, a send bus, dB helpers), `renderOffline` in core, docs and skill reference, and an FX Rack showroom demo, so an app on audiorective needs nothing from Tone.js.

**Architecture:** Every effect is an `AudioProcessor` subclass built on a shared `Effect` base that owns stable `input`/`output` gains and a sample-accurate `wet` crossfade, wiring internals through `defineGraph` so latency compensation and bypass are free. Six effects are native-node graphs; Compressor/Limiter share one AudioWorklet DSP core wrapped in a latency-declaring processor; PitchShift has a native granular engine and a Signalsmith Stretch (WASM worklet) engine behind one param surface.

**Tech Stack:** TypeScript, Web Audio API, AudioWorklet, `@audiorective/core` (Param/SchedulableParam/Cell/defineGraph), `signalsmith-stretch@^1.3.2`, tsdown, vitest browser mode (headless Chromium via Playwright), Astro + React 19 for the demo.

**Spec:** `docs/superpowers/specs/2026-09-06-effects-package-design.md`

## Global Constraints

- New package `packages/effects`, name `@audiorective/effects`, version `2.1.2` (matches the monorepo; `bumpp -r --all` releases everything together). Depends on `@audiorective/core` (`workspace:^`) and `signalsmith-stretch` (`^1.3.2`) only.
- Tooling copies `packages/devtools`: `tsdown` ESM + dts, `vitest` browser mode with `fileParallelism: false`, tests in `tests/*.test.ts`, `tsconfig.json` identical to devtools'.
- Effect contract: `input: GainNode`, `output: GainNode` (stable), `params.wet: SchedulableParam` default `1`, linear crossfade, effect stays connected at `wet = 0`. Continuous controls are `SchedulableParam`; controls that rebuild a node are `Param`.
- Gains are linear. dB only through `dbToGain` / `gainToDb`. No dB-typed params.
- Parameter names and defaults follow Tone 14.7 where they exist. Output is not byte-exact with Tone.
- Worklet sources are JS template strings in `src/worklets/*.worklet.ts`, registered through `registerWorklet` (Blob URL, deduped per context, works on `OfflineAudioContext`).
- A bare `AudioWorkletNode` may never be a `defineGraph` endpoint; wrap it in an `AudioProcessor` that declares `latency`.
- Commit messages: conventional (`feat(effects): …`, `test(effects): …`, `docs: …`), each ending with the session's `Co-Authored-By` / `Claude-Session` trailer lines already configured in this repo's session.
- Run a package's tests with `pnpm --filter @audiorective/effects test -- --run`, the web app's with `pnpm --filter @audiorective/web test -- --run <path>`. Lint/format run in the pre-commit hook (`oxlint`, `prettier`).

---

## File structure

```
packages/effects/
  package.json  tsconfig.json  tsdown.config.ts  vitest.config.ts  README.md
  src/
    index.ts                      public exports
    db.ts                         dbToGain / gainToDb
    Effect.ts                     abstract base: input/output/wet crossfade
    registerWorklet.ts            per-context worklet loader
    internal/lfo.ts               phase-shifted PeriodicWave + Lfo helper
    internal/fanout.ts            one SchedulableParam driving many AudioParams
    Channel.ts  SendBus.ts
    Filter.ts  Distortion.ts  PingPongDelay.ts  Convolver.ts  Phaser.ts  FrequencyShifter.ts
    PitchShift.ts                 engine switch
    pitch/GranularShifter.ts      native two-delay engine (wet arm)
    pitch/StretchShifter.ts       Signalsmith wrapper (wet arm)
    dynamics/DynamicsCore.ts      worklet-wrapping processor (wet arm)
    Compressor.ts  Limiter.ts
    worklets/dynamics.worklet.ts  JS source string
    types/signalsmith-stretch.d.ts
  tests/  one file per source module + latency.test.ts
packages/core/src/renderOffline.ts (+ index export, docs/core.md, CHANGELOG)
docs/effects.md
skills/audiorective/references/effects.md  (+ SKILL.md rows)
apps/web/src/demos/fx-rack/  audio/{FxRack,engine,impulseResponse,wavEncode}.ts  ui/*  FxRackApp.tsx  README.md
apps/web/src/pages/showroom/fx-rack.astro, apps/web/src/data/demos.ts, apps/web/astro.config.mjs (sidebar)
apps/web/tests/fx-rack/fxRack.test.ts
```

---

### Task 1: Package scaffold and dB helpers

**Files:**

- Create: `packages/effects/package.json`, `packages/effects/tsconfig.json`, `packages/effects/tsdown.config.ts`, `packages/effects/vitest.config.ts`, `packages/effects/README.md`, `packages/effects/src/index.ts`, `packages/effects/src/db.ts`
- Test: `packages/effects/tests/db.test.ts`

**Interfaces:**

- Produces: `dbToGain(db: number): number`, `gainToDb(gain: number): number`.

- [ ] **Step 1: Scaffold files**

`packages/effects/package.json`:

```json
{
  "name": "@audiorective/effects",
  "version": "2.1.2",
  "description": "DSP effects for audiorective — filter, distortion, phaser, frequency shifter, ping-pong delay, convolver, compressor, limiter, pitch shift, channel strip and send bus",
  "type": "module",
  "license": "MIT",
  "homepage": "https://github.com/audiorective/audiorective/tree/main/packages/effects#readme",
  "bugs": { "url": "https://github.com/audiorective/audiorective/issues" },
  "repository": { "type": "git", "url": "git+https://github.com/audiorective/audiorective.git", "directory": "packages/effects" },
  "author": "Chriest Yu <jcppman@gmai.com>",
  "files": ["dist"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": "./dist/index.js", "./package.json": "./package.json" },
  "scripts": { "build": "tsdown", "dev": "tsdown --watch", "test": "vitest", "typecheck": "tsc --noEmit" },
  "dependencies": { "@audiorective/core": "workspace:^", "signalsmith-stretch": "^1.3.2" },
  "devDependencies": {
    "@audiorective/devtools": "workspace:^",
    "@types/node": "^24.9.1",
    "@vitest/browser": "^4.0.18",
    "@vitest/browser-playwright": "^4.0.18",
    "playwright": "^1.58.2",
    "tsdown": "^0.15.9",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

Copy `packages/devtools/tsconfig.json`, `tsdown.config.ts`, and `vitest.config.ts` verbatim into `packages/effects/`.

`packages/effects/README.md`: one paragraph — what the package is, a link to `docs/effects.md`, and an install line `pnpm add @audiorective/effects @audiorective/core`.

`packages/effects/src/db.ts`:

```ts
/** Linear gain for a level in decibels. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Level in decibels for a linear gain; `-Infinity` at 0. */
export function gainToDb(gain: number): number {
  return gain <= 0 ? -Infinity : 20 * Math.log10(gain);
}
```

`packages/effects/src/index.ts`:

```ts
export { dbToGain, gainToDb } from "./db";
```

- [ ] **Step 2: Write the failing test** `packages/effects/tests/db.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { dbToGain, gainToDb } from "../src";

describe("db helpers", () => {
  it("0 dB is unity, -6 dB halves, +20 dB is 10x", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6.0206)).toBeCloseTo(0.5, 4);
    expect(dbToGain(20)).toBeCloseTo(10, 9);
  });
  it("round-trips and clamps zero to -Infinity", () => {
    expect(gainToDb(dbToGain(-12.5))).toBeCloseTo(-12.5, 9);
    expect(gainToDb(0)).toBe(-Infinity);
    expect(gainToDb(-1)).toBe(-Infinity);
  });
});
```

- [ ] **Step 3: Install and run**

Run: `pnpm install && pnpm --filter @audiorective/effects test -- --run tests/db.test.ts`
Expected: PASS (2 tests). Then `pnpm --filter @audiorective/effects typecheck` and `build` succeed.

- [ ] **Step 4: Commit**

```bash
git add packages/effects pnpm-lock.yaml
git commit -m "feat(effects): scaffold @audiorective/effects with dB helpers"
```

---

### Task 2: `registerWorklet`

**Files:**

- Create: `packages/effects/src/registerWorklet.ts`
- Modify: `packages/effects/src/index.ts`
- Test: `packages/effects/tests/registerWorklet.test.ts`

**Interfaces:**

- Produces: `registerWorklet(ctx: BaseAudioContext, name: string, source: string): Promise<void>`; `WorkletUnavailableError extends Error`.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorklet, WorkletUnavailableError } from "../src";

const SOURCE = `
class Passthrough extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const i = inputs[0], o = outputs[0];
    for (let c = 0; c < o.length; c++) o[c].set(i[c] ?? new Float32Array(o[c].length));
    return true;
  }
}
registerProcessor("test-passthrough", Passthrough);
`;

describe("registerWorklet", () => {
  let ctx: OfflineAudioContext;
  beforeEach(() => {
    ctx = new OfflineAudioContext(1, 128, 44100);
  });
  afterEach(() => vi.restoreAllMocks());

  it("calls addModule once for concurrent registrations of the same name", async () => {
    const spy = vi.spyOn(ctx.audioWorklet, "addModule");
    await Promise.all([registerWorklet(ctx, "test-passthrough", SOURCE), registerWorklet(ctx, "test-passthrough", SOURCE)]);
    await registerWorklet(ctx, "test-passthrough", SOURCE);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() => new AudioWorkletNode(ctx, "test-passthrough")).not.toThrow();
  });

  it("registers independently per context", async () => {
    const other = new OfflineAudioContext(1, 128, 44100);
    await registerWorklet(ctx, "test-passthrough", SOURCE);
    await registerWorklet(other, "test-passthrough", SOURCE);
    expect(() => new AudioWorkletNode(other, "test-passthrough")).not.toThrow();
  });

  it("throws WorkletUnavailableError when the context has no audioWorklet", async () => {
    const fake = { audioWorklet: undefined } as unknown as BaseAudioContext;
    await expect(registerWorklet(fake, "x", SOURCE)).rejects.toBeInstanceOf(WorkletUnavailableError);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`registerWorklet` not exported).

- [ ] **Step 3: Implement** `packages/effects/src/registerWorklet.ts`

```ts
export class WorkletUnavailableError extends Error {
  constructor(name: string) {
    super(`registerWorklet: this AudioContext has no audioWorklet, so "${name}" cannot be loaded. Run in a browser with AudioWorklet support.`);
    this.name = "WorkletUnavailableError";
  }
}

const registry = new WeakMap<BaseAudioContext, Map<string, Promise<void>>>();

/**
 * Loads a worklet module into `ctx` once per (context, name). Concurrent and
 * repeated calls share the first load. The source is served from a Blob URL,
 * so no bundler configuration is needed.
 */
export function registerWorklet(ctx: BaseAudioContext, name: string, source: string): Promise<void> {
  if (!ctx.audioWorklet) return Promise.reject(new WorkletUnavailableError(name));
  let perContext = registry.get(ctx);
  if (!perContext) {
    perContext = new Map();
    registry.set(ctx, perContext);
  }
  let pending = perContext.get(name);
  if (!pending) {
    const url = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
    pending = ctx.audioWorklet
      .addModule(url)
      .finally(() => URL.revokeObjectURL(url))
      .catch((err) => {
        perContext!.delete(name); // let a later call retry after a failed load
        throw err;
      });
    perContext.set(name, pending);
  }
  return pending;
}
```

Add to `index.ts`: `export { registerWorklet, WorkletUnavailableError } from "./registerWorklet";`

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `feat(effects): registerWorklet per-context loader`

---

### Task 3: `Effect` base class with wet/dry crossfade

**Files:**

- Create: `packages/effects/src/Effect.ts`
- Modify: `packages/effects/src/index.ts`
- Test: `packages/effects/tests/effect.test.ts`

**Interfaces:**

- Consumes: `AudioProcessor`, `BuildHelpers`, `SchedulableParam`, `Param` from core.
- Produces:

```ts
export interface WetArm {
  input: AudioNode | AudioProcessor;
  output: AudioNode | AudioProcessor;
}
export interface EffectOptions {
  wet?: number;
}
export abstract class Effect<P extends ParamRegistry = {}, C extends CellRegistry = {}> extends AudioProcessor<P & { wet: SchedulableParam }, C> {
  readonly input: GainNode;
  readonly output: GainNode;
  protected constructor(
    ctx: BaseAudioContext,
    arm: WetArm,
    build: (h: BuildHelpers) => { params: P; cells: C; latency?: number | Param<number> },
    opts?: EffectOptions,
  );
}
```

The wet arm's `input`/`output` may be a plain node or an `AudioProcessor` (used by the worklet-backed effects so latency flows into the graph). `Effect` leaves `latency` undeclared when the subclass doesn't declare one, so core derives it from the graph, which equals the wet arm's latency because compensation delays the dry arm to match.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { AudioProcessor } from "@audiorective/core";
import { Effect } from "../src/Effect";

/** Wet arm that inverts polarity — makes wet and dry trivially distinguishable. */
class Inverter extends Effect {
  constructor(ctx: BaseAudioContext, wet?: number) {
    const inv = new GainNode(ctx, { gain: -1 });
    super(ctx, { input: inv, output: inv }, () => ({ params: {}, cells: {} }), { wet });
  }
}

/** Wet arm with 100 samples of declared latency (a DelayNode standing in for a worklet). */
class Latent extends AudioProcessor {
  private readonly d: DelayNode;
  constructor(ctx: BaseAudioContext) {
    const d = new DelayNode(ctx, { delayTime: 100 / ctx.sampleRate, maxDelayTime: 1 });
    super(ctx, () => ({ latency: 100 }));
    this.d = d;
  }
  override get input() {
    return this.d;
  }
  get output() {
    return this.d;
  }
}
class LatentEffect extends Effect {
  constructor(ctx: BaseAudioContext) {
    const arm = new Latent(ctx);
    super(ctx, { input: arm, output: arm }, () => ({ params: {}, cells: {} }));
  }
}

async function render(build: (ctx: OfflineAudioContext) => Effect, frames = 512): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, frames, 44100);
  const fx = build(ctx);
  const src = new ConstantSourceNode(ctx, { offset: 0.5 });
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  src.start();
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

describe("Effect wet/dry", () => {
  it("wet = 0 passes the dry signal unchanged", async () => {
    const out = await render((ctx) => new Inverter(ctx, 0));
    expect(out[400]).toBeCloseTo(0.5, 6);
  });
  it("wet = 1 passes only the effect arm", async () => {
    const out = await render((ctx) => new Inverter(ctx, 1));
    expect(out[400]).toBeCloseTo(-0.5, 6);
  });
  it("wet = 0.25 mixes linearly", async () => {
    const out = await render((ctx) => new Inverter(ctx, 0.25));
    expect(out[400]).toBeCloseTo(0.75 * 0.5 + 0.25 * -0.5, 6);
  });
  it("a ramp on wet is sample-accurate on both arms", async () => {
    const out = await render((ctx) => {
      const fx = new Inverter(ctx, 0);
      fx.params.wet.setValueAtTime(0, 0).linearRampToValueAtTime(1, 256 / ctx.sampleRate);
      return fx;
    });
    // at frame 128 wet ≈ 0.5 → dry 0.25 + wet -0.25 = 0
    expect(Math.abs(out[128]!)).toBeLessThan(0.02);
    expect(out[400]).toBeCloseTo(-0.5, 6);
  });
  it("derives latency from the wet arm and delays the dry arm to match", async () => {
    const ctx = new OfflineAudioContext(1, 1024, 44100);
    const fx = new LatentEffect(ctx);
    fx.params.wet.value = 0.5;
    expect(fx.latency.value).toBe(100);
    const src = new ConstantSourceNode(ctx, { offset: 1 });
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    src.start(0);
    const out = (await ctx.startRendering()).getChannelData(0);
    // both arms arrive together at sample 100: nothing before, full level after
    expect(out[50]).toBeCloseTo(0, 6);
    expect(out[300]).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `packages/effects/src/Effect.ts`

```ts
import { AudioProcessor, type BuildHelpers, type Param, type SchedulableParam } from "@audiorective/core";

// Registry constraints mirror core's (invariant Param<T>/Cell<T> need `any`).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParamRegistry = Record<string, Param<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CellRegistry = Record<string, import("@audiorective/core").Cell<any>>;

export interface WetArm {
  input: AudioNode | AudioProcessor;
  output: AudioNode | AudioProcessor;
}

export interface EffectOptions {
  /** Initial wet mix 0..1. Default 1. */
  wet?: number;
}

/**
 * Base for every effect: stable `input`/`output` gains and a linear wet/dry
 * crossfade. `wet` is one automation signal that drives the wet gain directly
 * and the dry gain as `1 − wet`, so ramps land sample-accurately on both arms.
 * The graph is compensated, so a latent wet arm delays the dry arm to match and
 * the effect's own latency (when not declared) derives to the wet arm's.
 */
export abstract class Effect<P extends ParamRegistry = {}, C extends CellRegistry = {}> extends AudioProcessor<P & { wet: SchedulableParam }, C> {
  readonly input: GainNode;
  readonly output: GainNode;

  protected constructor(
    ctx: BaseAudioContext,
    arm: WetArm,
    build: (h: BuildHelpers) => { params: P; cells: C; latency?: number | Param<number> },
    opts: EffectOptions = {},
  ) {
    const input = new GainNode(ctx);
    const output = new GainNode(ctx);
    const dry = new GainNode(ctx, { gain: 0 }); // driven by 1 − wet
    const wetGain = new GainNode(ctx, { gain: 0 }); // driven by wet
    const one = new ConstantSourceNode(ctx, { offset: 1 });
    const negate = new GainNode(ctx, { gain: -1 });
    const wetSignal = new ConstantSourceNode(ctx, { offset: opts.wet ?? 1 });
    one.start();
    wetSignal.start();

    super(ctx, (h) => {
      const built = build(h);
      return {
        ...built,
        params: { ...built.params, wet: h.param({ default: opts.wet ?? 1, bind: wetSignal.offset, min: 0, max: 1 }) },
      };
    });

    this.input = input;
    this.output = output;

    this.defineGraph(
      () => [
        [input, dry],
        [dry, output],
        [input, arm.input],
        [arm.output, wetGain],
        [wetGain, output],
        [wetSignal, wetGain.gain],
        [wetSignal, negate],
        [negate, dry.gain],
        [one, dry.gain],
      ],
      { compensate: true },
    );

    this._sources = [one, wetSignal];
  }

  private readonly _sources: ConstantSourceNode[];

  override destroy(): void {
    for (const s of this._sources) {
      s.stop();
      s.disconnect();
    }
    super.destroy();
  }
}
```

Note: `this._sources` is assigned after `super()`; declare it without an initializer so the assignment order compiles under `useDefineForClassFields`. Export from `index.ts`: `export { Effect } from "./Effect"; export type { WetArm, EffectOptions } from "./Effect";`

- [ ] **Step 4: Run, expect PASS.** If the derived-latency test fails because core derives latency only for processors with no declared latency AND a graph, confirm `Effect` passes no `latency` key when the subclass omits it (`...built` must not include `latency: undefined`) — strip undefined before spreading.

- [ ] **Step 5: Commit** — `feat(effects): Effect base with sample-accurate wet/dry crossfade`

---

### Task 4: `Channel` and `SendBus`

**Files:**

- Create: `packages/effects/src/SendBus.ts`, `packages/effects/src/Channel.ts`
- Modify: `packages/effects/src/index.ts`
- Test: `packages/effects/tests/channel.test.ts`

**Interfaces:**

- Produces:

```ts
class SendBus {
  constructor(ctx: BaseAudioContext);
  define(name: string): GainNode;
  receive(name: string): GainNode;
  has(name: string): boolean;
  destroy(): void;
}
interface ChannelOptions {
  gain?: number;
  pan?: number;
  mute?: boolean;
  channelCount?: number;
}
class Channel extends AudioProcessor<{ gain: SchedulableParam; pan: SchedulableParam; mute: Param<boolean> }> {
  readonly input: GainNode;
  readonly output: GainNode;
  send(bus: SendBus, name: string, gain?: number): Send;
}
interface Send {
  readonly gain: SchedulableParam;
  dispose(): void;
}
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Channel, SendBus } from "../src";

async function renderStereo(build: (ctx: OfflineAudioContext) => void, frames = 256) {
  const ctx = new OfflineAudioContext(2, frames, 44100);
  build(ctx);
  return ctx.startRendering();
}

describe("Channel", () => {
  it("gain scales, mute silences, unmute restores", async () => {
    const buf = await renderStereo((ctx) => {
      const ch = new Channel(ctx, { gain: 0.5 });
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      ch.output.connect(ctx.destination);
      src.start();
      ch.params.mute.value = true;
      ctx.suspend(128 / 44100).then(() => {
        ch.params.mute.value = false;
        ctx.resume();
      });
    });
    const l = buf.getChannelData(0);
    expect(l[64]).toBeCloseTo(0, 6);
    expect(l[250]).toBeCloseTo(0.5, 6);
  });

  it("pan = 1 puts a mono source in the right channel only", async () => {
    const buf = await renderStereo((ctx) => {
      const ch = new Channel(ctx, { pan: 1 });
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      ch.output.connect(ctx.destination);
      src.start();
    });
    expect(buf.getChannelData(0)[200]).toBeCloseTo(0, 5);
    expect(buf.getChannelData(1)[200]).toBeGreaterThan(0.9);
  });

  it("a send delivers the post-mute signal at its own gain", async () => {
    let tapped!: Float32Array;
    const buf = await renderStereo((ctx) => {
      const bus = new SendBus(ctx);
      bus.define("hall");
      const ch = new Channel(ctx);
      const src = new ConstantSourceNode(ctx, { offset: 1 });
      src.connect(ch.input);
      src.start();
      const send = ch.send(bus, "hall", 0.5);
      expect(send.gain.value).toBe(0.5);
      bus.receive("hall").connect(ctx.destination); // only the send reaches the output
    });
    tapped = buf.getChannelData(0);
    expect(tapped[200]).toBeCloseTo(0.5, 5);
  });

  it("SendBus.receive throws for an undefined name", () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const bus = new SendBus(ctx);
    expect(() => bus.receive("nope")).toThrow(/nope/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`SendBus.ts`:

```ts
/** Named receive points a Channel can send into. Instance-scoped; one per rack. */
export class SendBus {
  private readonly receives = new Map<string, GainNode>();
  constructor(private readonly ctx: BaseAudioContext) {}

  define(name: string): GainNode {
    let node = this.receives.get(name);
    if (!node) {
      node = new GainNode(this.ctx);
      this.receives.set(name, node);
    }
    return node;
  }

  receive(name: string): GainNode {
    const node = this.receives.get(name);
    if (!node) throw new Error(`SendBus: no receive named "${name}" — call define("${name}") first`);
    return node;
  }

  has(name: string): boolean {
    return this.receives.has(name);
  }

  destroy(): void {
    for (const node of this.receives.values()) node.disconnect();
    this.receives.clear();
  }
}
```

`Channel.ts`:

```ts
import { AudioProcessor, type Param, type SchedulableParam, SchedulableParam as SchedulableParamClass } from "@audiorective/core";
import type { SendBus } from "./SendBus";

export interface ChannelOptions {
  gain?: number;
  pan?: number;
  mute?: boolean;
  /** Output channel count; mono input is upmixed. Default 2. */
  channelCount?: number;
}

export interface Send {
  readonly gain: SchedulableParam;
  dispose(): void;
}

/** Channel strip: gain → pan → mute, with post-mute sends into a SendBus. */
export class Channel extends AudioProcessor<{ gain: SchedulableParam; pan: SchedulableParam; mute: Param<boolean> }> {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly sends = new Set<{ node: GainNode; param: SchedulableParam }>();

  constructor(ctx: BaseAudioContext, opts: ChannelOptions = {}) {
    const input = new GainNode(ctx, { channelCount: opts.channelCount ?? 2, channelCountMode: "explicit" });
    const gain = new GainNode(ctx, { gain: opts.gain ?? 1 });
    const pan = new StereoPannerNode(ctx, { pan: opts.pan ?? 0 });
    const mute = new GainNode(ctx, { gain: opts.mute ? 0 : 1 });
    const output = new GainNode(ctx);

    super(ctx, ({ param }) => ({
      params: {
        gain: param({ default: opts.gain ?? 1, bind: gain.gain, min: 0 }),
        pan: param({ default: opts.pan ?? 0, bind: pan.pan, min: -1, max: 1 }),
        mute: param<boolean>({
          default: opts.mute ?? false,
          bind: {
            set: (m) => {
              mute.gain.value = m ? 0 : 1;
            },
          },
        }),
      },
    }));

    this.input = input;
    this.output = output;
    this.defineGraph(() => [
      [input, gain],
      [gain, pan],
      [pan, mute],
      [mute, output],
    ]);
  }

  send(bus: SendBus, name: string, gain = 1): Send {
    const node = new GainNode(this.context, { gain });
    this.output.connect(node);
    node.connect(bus.receive(name));
    const param = new SchedulableParamClass({ default: gain, audioContext: this.context, audioParam: node.gain, min: 0 });
    const entry = { node, param };
    this.sends.add(entry);
    return {
      gain: param,
      dispose: () => {
        if (!this.sends.delete(entry)) return;
        param.destroy();
        node.disconnect();
      },
    };
  }

  override destroy(): void {
    for (const { node, param } of this.sends) {
      param.destroy();
      node.disconnect();
    }
    this.sends.clear();
    super.destroy();
  }
}
```

Exports: `Channel`, `SendBus`, types `ChannelOptions`, `Send`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `feat(effects): Channel strip and SendBus`

---

### Task 5: Internal helpers — param fan-out and phased LFO

**Files:**

- Create: `packages/effects/src/internal/fanout.ts`, `packages/effects/src/internal/lfo.ts`
- Test: `packages/effects/tests/internal.test.ts`

**Interfaces:**

- Produces:

```ts
// fanout.ts — one automation signal driving several AudioParams.
// Each target's intrinsic value is set to 0 so the summed input IS the value.
export function fanout(ctx: BaseAudioContext, initial: number, targets: AudioParam[]): ConstantSourceNode;

// lfo.ts
export type LfoShape = "sine" | "sawtooth" | "triangle";
/** PeriodicWave for `shape` shifted by `phaseDeg`, `partials` harmonics, unnormalized. */
export function phasedWave(ctx: BaseAudioContext, shape: LfoShape, phaseDeg: number, partials?: number): PeriodicWave;
export interface LfoOptions {
  shape: LfoShape;
  phaseDeg?: number;
  frequency: number;
  min: number;
  max: number;
}
/** osc(−1..1) → depth gain → target, plus a constant centre → target. `setRange` retunes min/max. */
export class Lfo {
  constructor(ctx: BaseAudioContext, opts: LfoOptions);
  readonly frequency: AudioParam; // osc.frequency — bind a SchedulableParam here
  connect(target: AudioParam): void; // target intrinsic value set to 0 by caller
  setRange(min: number, max: number): void;
  start(when?: number): void;
  stop(): void;
  disconnect(): void;
}
```

Fourier coefficients (Web Audio's own series, so phase 0 equals the built-in shapes):

- sine: `b1 = 1`.
- sawtooth: `b_n = (-1)^(n+1) · 2/(πn)`.
- triangle: odd n only, `b_n = (8/π²) · (-1)^((n-1)/2) / n²`.
  Phase shift φ (radians): `real[n] = b_n · sin(nφ)`, `imag[n] = b_n · cos(nφ)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { fanout } from "../src/internal/fanout";
import { Lfo, phasedWave } from "../src/internal/lfo";

const render = async (frames: number, build: (ctx: OfflineAudioContext) => void) => {
  const ctx = new OfflineAudioContext(1, frames, 44100);
  build(ctx);
  return (await ctx.startRendering()).getChannelData(0);
};

describe("fanout", () => {
  it("drives two gains from one source", async () => {
    const out = await render(256, (ctx) => {
      const a = new GainNode(ctx),
        b = new GainNode(ctx);
      const cs = new ConstantSourceNode(ctx, { offset: 1 });
      cs.start();
      cs.connect(a);
      cs.connect(b);
      fanout(ctx, 0.25, [a.gain, b.gain]);
      a.connect(ctx.destination);
      b.connect(ctx.destination);
    });
    expect(out[200]).toBeCloseTo(0.5, 5); // 0.25 + 0.25
  });
});

describe("phasedWave", () => {
  it("phase 0 sawtooth matches the built-in sawtooth", async () => {
    const [builtin, custom] = await Promise.all([
      render(4410, (ctx) => {
        const o = new OscillatorNode(ctx, { type: "sawtooth", frequency: 10 });
        o.connect(ctx.destination);
        o.start();
      }),
      render(4410, (ctx) => {
        const o = new OscillatorNode(ctx, { frequency: 10, periodicWave: phasedWave(ctx, "sawtooth", 0) });
        o.connect(ctx.destination);
        o.start();
      }),
    ]);
    // compare away from the discontinuity
    for (const i of [500, 1000, 1500, 3000]) expect(custom[i]).toBeCloseTo(builtin[i]!, 1);
  });
  it("a 180° sawtooth is the 0° sawtooth half a period later", async () => {
    const out = await render(4410, (ctx) => {
      const o = new OscillatorNode(ctx, { frequency: 10, periodicWave: phasedWave(ctx, "sawtooth", 180) });
      o.connect(ctx.destination);
      o.start();
    });
    const ref = await render(4410, (ctx) => {
      const o = new OscillatorNode(ctx, { frequency: 10, periodicWave: phasedWave(ctx, "sawtooth", 0) });
      o.connect(ctx.destination);
      o.start();
    });
    expect(out[1000]).toBeCloseTo(ref[1000 + 2205]!, 1);
  });
});

describe("Lfo", () => {
  it("maps −1..1 into min..max on the target", async () => {
    const out = await render(4410, (ctx) => {
      const g = new GainNode(ctx, { gain: 0 });
      const cs = new ConstantSourceNode(ctx, { offset: 1 });
      cs.start();
      cs.connect(g);
      g.connect(ctx.destination);
      const lfo = new Lfo(ctx, { shape: "sine", frequency: 10, min: 0.2, max: 0.8 });
      lfo.connect(g.gain);
      lfo.start();
    });
    let min = Infinity,
      max = -Infinity;
    for (const v of out) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeCloseTo(0.2, 2);
    expect(max).toBeCloseTo(0.8, 2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`internal/fanout.ts`:

```ts
export function fanout(ctx: BaseAudioContext, initial: number, targets: AudioParam[]): ConstantSourceNode {
  const source = new ConstantSourceNode(ctx, { offset: initial });
  for (const t of targets) {
    t.value = 0;
    source.connect(t);
  }
  source.start();
  return source;
}
```

`internal/lfo.ts`:

```ts
export type LfoShape = "sine" | "sawtooth" | "triangle";

function coefficient(shape: LfoShape, n: number): number {
  switch (shape) {
    case "sine":
      return n === 1 ? 1 : 0;
    case "sawtooth":
      return ((n % 2 === 1 ? 1 : -1) * 2) / (Math.PI * n);
    case "triangle":
      if (n % 2 === 0) return 0;
      return ((8 / (Math.PI * Math.PI)) * (((n - 1) / 2) % 2 === 0 ? 1 : -1)) / (n * n);
  }
}

export function phasedWave(ctx: BaseAudioContext, shape: LfoShape, phaseDeg: number, partials = 1024): PeriodicWave {
  const phi = (phaseDeg * Math.PI) / 180;
  const real = new Float32Array(partials + 1);
  const imag = new Float32Array(partials + 1);
  for (let n = 1; n <= partials; n++) {
    const b = coefficient(shape, n);
    if (b === 0) continue;
    real[n] = b * Math.sin(n * phi);
    imag[n] = b * Math.cos(n * phi);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}

export interface LfoOptions {
  shape: LfoShape;
  phaseDeg?: number;
  frequency: number;
  min: number;
  max: number;
}

export class Lfo {
  private readonly osc: OscillatorNode;
  private readonly depth: GainNode;
  private readonly centre: ConstantSourceNode;
  readonly frequency: AudioParam;

  constructor(ctx: BaseAudioContext, opts: LfoOptions) {
    this.osc = new OscillatorNode(ctx, { frequency: opts.frequency, periodicWave: phasedWave(ctx, opts.shape, opts.phaseDeg ?? 0) });
    this.depth = new GainNode(ctx, { gain: 0 });
    this.centre = new ConstantSourceNode(ctx, { offset: 0 });
    this.osc.connect(this.depth);
    this.frequency = this.osc.frequency;
    this.setRange(opts.min, opts.max);
  }

  setRange(min: number, max: number): void {
    this.depth.gain.value = (max - min) / 2;
    this.centre.offset.value = (max + min) / 2;
  }

  connect(target: AudioParam): void {
    target.value = 0;
    this.depth.connect(target);
    this.centre.connect(target);
  }

  start(when = 0): void {
    this.osc.start(when);
    this.centre.start(when);
  }

  stop(): void {
    try {
      this.osc.stop();
      this.centre.stop();
    } catch {
      /* not started */
    }
  }

  disconnect(): void {
    this.stop();
    this.osc.disconnect();
    this.depth.disconnect();
    this.centre.disconnect();
  }
}
```

- [ ] **Step 4: Run, expect PASS.** The sawtooth comparison tolerates Gibbs ringing (`toBeCloseTo(…, 1)`); if it fails only near sample 3000, move that sample away from the wrap at 4410/10 boundaries.

- [ ] **Step 5: Commit** — `feat(effects): internal fanout and phased LFO helpers`

---

### Task 6: `Filter`

**Files:**

- Create: `packages/effects/src/Filter.ts`
- Modify: `packages/effects/src/index.ts`
- Test: `packages/effects/tests/filter.test.ts`

**Interfaces:**

- Produces:

```ts
interface FilterOptions extends EffectOptions { frequency?: number; type?: BiquadFilterType; Q?: number; gain?: number; rolloff?: -12 | -24 | -48 }
class Filter extends Effect<{ frequency: SchedulableParam; Q: SchedulableParam; gain: SchedulableParam; type: Param<BiquadFilterType> }>
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Filter } from "../src";

/** RMS of a rendered sine through `build`, steady-state (skip the first half). */
async function rmsThrough(freq: number, build: (ctx: OfflineAudioContext) => Filter): Promise<number> {
  const ctx = new OfflineAudioContext(1, 44100, 44100);
  const fx = build(ctx);
  const osc = new OscillatorNode(ctx, { frequency: freq });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  const d = (await ctx.startRendering()).getChannelData(0);
  let sum = 0;
  const from = d.length / 2;
  for (let i = from; i < d.length; i++) sum += d[i]! * d[i]!;
  return Math.sqrt(sum / (d.length - from));
}
const db = (a: number, b: number) => 20 * Math.log10(a / b);

describe("Filter", () => {
  it("lowpass at 1 kHz passes 100 Hz and attenuates 4 kHz by ≥ 12 dB per stage", async () => {
    const pass = await rmsThrough(100, (ctx) => new Filter(ctx, { frequency: 1000, type: "lowpass" }));
    const cut12 = await rmsThrough(4000, (ctx) => new Filter(ctx, { frequency: 1000, type: "lowpass", rolloff: -12 }));
    const cut24 = await rmsThrough(4000, (ctx) => new Filter(ctx, { frequency: 1000, type: "lowpass", rolloff: -24 }));
    expect(db(pass, Math.SQRT1_2)).toBeGreaterThan(-1);
    expect(db(cut12, Math.SQRT1_2)).toBeLessThan(-20);
    expect(db(cut24, Math.SQRT1_2)).toBeLessThan(db(cut12, Math.SQRT1_2) - 15);
  });
  it("type switches live and frequency ramps are honoured", async () => {
    const hp = await rmsThrough(100, (ctx) => {
      const f = new Filter(ctx, { frequency: 1000 });
      f.params.type.value = "highpass";
      return f;
    });
    expect(db(hp, Math.SQRT1_2)).toBeLessThan(-30);
    const ramped = await rmsThrough(4000, (ctx) => {
      const f = new Filter(ctx, { frequency: 200, type: "lowpass" });
      f.params.frequency.linearRampToValueAtTime(20000, 0.4); // fully open before the measured half
      return f;
    });
    expect(db(ramped, Math.SQRT1_2)).toBeGreaterThan(-1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `Filter.ts`

```ts
import type { Param, SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";

export interface FilterOptions extends EffectOptions {
  frequency?: number;
  type?: BiquadFilterType;
  Q?: number;
  gain?: number;
  /** dB per octave; one biquad per 12 dB in series. Default -12. */
  rolloff?: -12 | -24 | -48;
}

export class Filter extends Effect<{ frequency: SchedulableParam; Q: SchedulableParam; gain: SchedulableParam; type: Param<BiquadFilterType> }> {
  private readonly sources: ConstantSourceNode[];

  constructor(ctx: BaseAudioContext, opts: FilterOptions = {}) {
    const stageCount = Math.abs(opts.rolloff ?? -12) / 12;
    const type = opts.type ?? "lowpass";
    const stages = Array.from({ length: stageCount }, () => new BiquadFilterNode(ctx, { type }));
    for (let i = 1; i < stages.length; i++) stages[i - 1]!.connect(stages[i]!);

    const freq = fanout(
      ctx,
      opts.frequency ?? 350,
      stages.map((s) => s.frequency),
    );
    const q = fanout(
      ctx,
      opts.Q ?? 1,
      stages.map((s) => s.Q),
    );
    const gain = fanout(
      ctx,
      opts.gain ?? 0,
      stages.map((s) => s.gain),
    );

    super(
      ctx,
      { input: stages[0]!, output: stages[stages.length - 1]! },
      ({ param }) => ({
        params: {
          frequency: param({ default: opts.frequency ?? 350, bind: freq.offset, min: 10, max: 22050 }),
          Q: param({ default: opts.Q ?? 1, bind: q.offset, min: 0.0001, max: 1000 }),
          gain: param({ default: opts.gain ?? 0, bind: gain.offset, min: -40, max: 40 }),
          type: param<BiquadFilterType>({
            default: type,
            bind: {
              set: (t) =>
                stages.forEach((s) => {
                  s.type = t;
                }),
            },
          }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    this.sources = [freq, q, gain];
  }

  override destroy(): void {
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    super.destroy();
  }
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `feat(effects): Filter with stacked biquads`

---

### Task 7: `Distortion`

**Files:**

- Create: `packages/effects/src/Distortion.ts`; Modify: `src/index.ts`; Test: `tests/distortion.test.ts`

**Interfaces:**

- Produces: `interface DistortionOptions extends EffectOptions { distortion?: number; oversample?: OverSampleType }`, `class Distortion extends Effect<{ distortion: Param<number> }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Distortion } from "../src";

async function renderSine(build: (ctx: OfflineAudioContext) => Distortion) {
  const ctx = new OfflineAudioContext(1, 8192, 44100);
  const fx = build(ctx);
  const osc = new OscillatorNode(ctx, { frequency: 441 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0);
}
const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, v) => s + v * v, 0) / d.length);

describe("Distortion", () => {
  it("distortion = 0 is unity within 1e-3", async () => {
    const out = await renderSine((ctx) => new Distortion(ctx, { distortion: 0 }));
    const ref = await renderSine((ctx) => new Distortion(ctx, { distortion: 0, wet: 0 }));
    for (const i of [1000, 2000, 3000]) expect(out[i]).toBeCloseTo(ref[i]!, 3);
  });
  it("more distortion raises RMS (squarer wave) and never exceeds ±1.05", async () => {
    const soft = rms(await renderSine((ctx) => new Distortion(ctx, { distortion: 0.2 })));
    const hard = await renderSine((ctx) => new Distortion(ctx, { distortion: 0.9 }));
    expect(rms(hard)).toBeGreaterThan(soft);
    expect(Math.max(...Array.from(hard, Math.abs))).toBeLessThan(1.05);
  });
  it("the param regenerates the curve live", async () => {
    const out = await renderSine((ctx) => {
      const d = new Distortion(ctx, { distortion: 0 });
      d.params.distortion.value = 0.9;
      return d;
    });
    expect(rms(out)).toBeGreaterThan(0.75);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** `Distortion.ts`

```ts
import type { Param } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";

export interface DistortionOptions extends EffectOptions {
  /** 0..1 drive. Default 0.4. */
  distortion?: number;
  /** WaveShaper oversampling. Default "4x". */
  oversample?: OverSampleType;
}

const CURVE_LENGTH = 4096;

/** Tone.js's distortion curve: soft clipping that approaches a square as k grows. */
export function distortionCurve(amount: number): Float32Array {
  const k = amount * 100;
  const deg = Math.PI / 180;
  const curve = new Float32Array(CURVE_LENGTH);
  for (let i = 0; i < CURVE_LENGTH; i++) {
    const x = (i * 2) / CURVE_LENGTH - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export class Distortion extends Effect<{ distortion: Param<number> }> {
  constructor(ctx: BaseAudioContext, opts: DistortionOptions = {}) {
    const shaper = new WaveShaperNode(ctx, { oversample: opts.oversample ?? "4x", curve: distortionCurve(opts.distortion ?? 0.4) });
    super(
      ctx,
      { input: shaper, output: shaper },
      ({ param }) => ({
        params: {
          distortion: param<number>({
            default: opts.distortion ?? 0.4,
            min: 0,
            max: 1,
            bind: {
              set: (v) => {
                shaper.curve = distortionCurve(v);
              },
            },
          }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
  }
}
```

- [ ] **Step 4: Run, expect PASS.** If the unity test fails at 1e-3 because the curve at `k=0` is `x · 60 · deg / π ≈ 1.047x`, that is Tone's curve too (it is not exactly unity); relax the assertion to compare against `ref[i] * 60 * (Math.PI / 180) / Math.PI` and note in the doc that `distortion = 0` applies ×1.047.

- [ ] **Step 5: Commit** — `feat(effects): Distortion with oversampled waveshaper`

---

### Task 8: `PingPongDelay`

**Files:**

- Create: `packages/effects/src/PingPongDelay.ts`; Modify: `src/index.ts`; Test: `tests/pingPongDelay.test.ts`

**Interfaces:**

- Produces: `interface PingPongDelayOptions extends EffectOptions { delayTime?: number; feedback?: number; maxDelay?: number }`, `class PingPongDelay extends Effect<{ delayTime: SchedulableParam; feedback: SchedulableParam }>`.

Graph (stereo): `splitter(input) → L: delayL; R: delayR`. `delayL → merger.L`, `delayL → fbL(gain=feedback) → delayR`; `delayR → merger.R`, `delayR → fbR → delayL`. A mono input reaches both delays through the splitter's channel 0 when the input has one channel; set the wet-arm entry gain `channelCount: 2, channelCountMode: "explicit"` so mono is upmixed before the split.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PingPongDelay } from "../src";

describe("PingPongDelay", () => {
  it("an impulse echoes alternately L/R at delayTime with feedback decay", async () => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, sr, sr);
    const fx = new PingPongDelay(ctx, { delayTime: 0.1, feedback: 0.5 });
    const impulse = ctx.createBuffer(1, 1, sr);
    impulse.getChannelData(0)[0] = 1;
    const src = new AudioBufferSourceNode(ctx, { buffer: impulse });
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    src.start();
    const buf = await ctx.startRendering();
    const L = buf.getChannelData(0),
      R = buf.getChannelData(1);
    const at = (d: Float32Array, t: number) => {
      let m = 0;
      for (let i = Math.round(t * sr) - 4; i < Math.round(t * sr) + 4; i++) m = Math.max(m, Math.abs(d[i] ?? 0));
      return m;
    };
    expect(at(L, 0.1)).toBeGreaterThan(0.4);
    expect(at(R, 0.1)).toBeLessThan(0.05);
    expect(at(R, 0.2)).toBeGreaterThan(0.2);
    expect(at(L, 0.2)).toBeLessThan(0.05);
    expect(at(L, 0.3)).toBeGreaterThan(0.1);
    expect(at(L, 0.3)).toBeLessThan(at(L, 0.1));
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import type { SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";

export interface PingPongDelayOptions extends EffectOptions {
  delayTime?: number;
  feedback?: number;
  /** Ceiling for delayTime, seconds. Default 1. */
  maxDelay?: number;
}

export class PingPongDelay extends Effect<{ delayTime: SchedulableParam; feedback: SchedulableParam }> {
  private readonly sources: ConstantSourceNode[];

  constructor(ctx: BaseAudioContext, opts: PingPongDelayOptions = {}) {
    const maxDelay = opts.maxDelay ?? 1;
    const entry = new GainNode(ctx, { channelCount: 2, channelCountMode: "explicit" });
    const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const delayL = new DelayNode(ctx, { maxDelayTime: maxDelay });
    const delayR = new DelayNode(ctx, { maxDelayTime: maxDelay });
    const fbL = new GainNode(ctx, { gain: 0 });
    const fbR = new GainNode(ctx, { gain: 0 });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    entry.connect(splitter);
    splitter.connect(delayL, 0);
    delayL.connect(merger, 0, 0);
    delayL.connect(fbL);
    fbL.connect(delayR);
    delayR.connect(merger, 0, 1);
    delayR.connect(fbR);
    fbR.connect(delayL);

    const time = fanout(ctx, opts.delayTime ?? 0.25, [delayL.delayTime, delayR.delayTime]);
    const fb = fanout(ctx, opts.feedback ?? 0.2, [fbL.gain, fbR.gain]);

    super(
      ctx,
      { input: entry, output: merger },
      ({ param }) => ({
        params: {
          delayTime: param({ default: opts.delayTime ?? 0.25, bind: time.offset, min: 0, max: maxDelay }),
          feedback: param({ default: opts.feedback ?? 0.2, bind: fb.offset, min: 0, max: 0.99 }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    this.sources = [time, fb];
  }

  override destroy(): void {
    for (const s of this.sources) {
      s.stop();
      s.disconnect();
    }
    super.destroy();
  }
}
```

The right channel of a stereo input is intentionally not fed straight into `delayR`: as in Tone, the input enters on the left and bounces. Document this in `docs/effects.md`.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `feat(effects): PingPongDelay`

---

### Task 9: `Convolver`

**Files:**

- Create: `packages/effects/src/Convolver.ts`; Modify: `src/index.ts`; Test: `tests/convolver.test.ts`

**Interfaces:**

- Produces: `interface ConvolverOptions extends EffectOptions { buffer?: AudioBuffer; url?: string; normalize?: boolean }`, `class Convolver extends Effect<{}, { isReady: Cell<boolean> }> { buffer: AudioBuffer | null; load(url: string): Promise<void>; ready: Promise<void> }`.

`load` uses one `AudioBufferCache` per context, kept in a module-level `WeakMap<BaseAudioContext, AudioBufferCache>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { Convolver } from "../src";

describe("Convolver", () => {
  it("a unit-impulse IR is identity and flips isReady", async () => {
    const ctx = new OfflineAudioContext(1, 512, 44100);
    const ir = ctx.createBuffer(1, 1, 44100);
    ir.getChannelData(0)[0] = 1;
    const fx = new Convolver(ctx, { normalize: false });
    expect(fx.cells.isReady.value).toBe(false);
    fx.buffer = ir;
    expect(fx.cells.isReady.value).toBe(true);
    const src = new ConstantSourceNode(ctx, { offset: 0.5 });
    src.connect(fx.input);
    fx.output.connect(ctx.destination);
    src.start();
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(out[400]).toBeCloseTo(0.5, 4);
  });
  it("load(url) decodes through the shared cache", async () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const ir = ctx.createBuffer(1, 4, 44100);
    const core = await import("@audiorective/core");
    vi.spyOn(core.AudioBufferCache.prototype, "load").mockResolvedValue(ir);
    const fx = new Convolver(ctx, { url: "/ir.wav" });
    await fx.ready;
    expect(fx.buffer).toBe(ir);
    expect(fx.cells.isReady.value).toBe(true);
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import { AudioBufferCache, type Cell } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";

export interface ConvolverOptions extends EffectOptions {
  buffer?: AudioBuffer;
  url?: string;
  /** ConvolverNode.normalize. Default true. */
  normalize?: boolean;
}

const caches = new WeakMap<BaseAudioContext, AudioBufferCache>();
function cacheFor(ctx: BaseAudioContext): AudioBufferCache {
  let c = caches.get(ctx);
  if (!c) {
    c = new AudioBufferCache(ctx);
    caches.set(ctx, c);
  }
  return c;
}

export class Convolver extends Effect<{}, { isReady: Cell<boolean> }> {
  private readonly node: ConvolverNode;
  /** Resolves once the initial `url` (if any) has loaded. */
  readonly ready: Promise<void>;

  constructor(ctx: BaseAudioContext, opts: ConvolverOptions = {}) {
    const node = new ConvolverNode(ctx, { disableNormalization: opts.normalize === false });
    super(ctx, { input: node, output: node }, ({ cell }) => ({ params: {}, cells: { isReady: cell(false) }, latency: 0 }), opts);
    this.node = node;
    if (opts.buffer) this.buffer = opts.buffer;
    this.ready = opts.url ? this.load(opts.url) : Promise.resolve();
  }

  get buffer(): AudioBuffer | null {
    return this.node.buffer;
  }
  set buffer(b: AudioBuffer | null) {
    this.node.buffer = b;
    this.cells.isReady.value = b !== null;
  }

  async load(url: string): Promise<void> {
    this.buffer = await cacheFor(this.context).load(url);
  }
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `feat(effects): Convolver with shared IR cache`

---

### Task 10: `Phaser`

**Files:**

- Create: `packages/effects/src/Phaser.ts`; Modify: `src/index.ts`; Test: `tests/phaser.test.ts`

**Interfaces:**

- Consumes: `Lfo`, `fanout` from Task 5.
- Produces: `interface PhaserOptions extends EffectOptions { frequency?: number; octaves?: number; baseFrequency?: number; Q?: number; stages?: number }`, `class Phaser extends Effect<{ frequency: SchedulableParam; Q: SchedulableParam; octaves: Param<number>; baseFrequency: Param<number> }>`.

Per channel: `stages` allpass biquads in series, every `frequency` driven by one sine `Lfo` with range `[baseFrequency, baseFrequency · 2^octaves]`; every `Q` driven by one fan-out. Stereo split/merge around the two chains.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Phaser } from "../src";

async function renderNoise(build: (ctx: OfflineAudioContext) => Phaser, seconds = 1) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const fx = build(ctx);
  const noise = ctx.createBuffer(1, sr * seconds, sr);
  const d = noise.getChannelData(0);
  let seed = 1;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  src.start();
  return ctx.startRendering();
}
/** Magnitude at `bin` of a naive DFT over `frame` (small N keeps this cheap). */
function magnitude(frame: Float32Array, freq: number, sr: number): number {
  let re = 0,
    im = 0;
  for (let n = 0; n < frame.length; n++) {
    const w = (2 * Math.PI * freq * n) / sr;
    re += frame[n]! * Math.cos(w);
    im -= frame[n]! * Math.sin(w);
  }
  return Math.hypot(re, im) / frame.length;
}

describe("Phaser", () => {
  it("with the LFO stopped (frequency 0) the spectrum has notches the dry signal lacks", async () => {
    const wet = await renderNoise((ctx) => new Phaser(ctx, { frequency: 0, baseFrequency: 500, octaves: 0, Q: 10, stages: 4 }));
    const dry = await renderNoise((ctx) => new Phaser(ctx, { frequency: 0, baseFrequency: 500, octaves: 0, Q: 10, stages: 4, wet: 0 }));
    const frame = (b: AudioBuffer) => b.getChannelData(0).subarray(20000, 20000 + 4096);
    // 4 allpass stages at 500 Hz summed with dry → deep notch near 500 Hz
    const ratio = magnitude(frame(wet), 500, 44100) / magnitude(frame(dry), 500, 44100);
    expect(ratio).toBeLessThan(0.3);
  });
  it("with the LFO running the notch moves over time", async () => {
    const wet = await renderNoise((ctx) => new Phaser(ctx, { frequency: 2, baseFrequency: 300, octaves: 3, Q: 10 }), 1);
    const d = wet.getChannelData(0);
    const a = magnitude(d.subarray(4096, 8192), 300, 44100);
    const b = magnitude(d.subarray(4096 + 11025, 8192 + 11025), 300, 44100); // quarter LFO period later
    expect(Math.abs(a - b) / Math.max(a, b)).toBeGreaterThan(0.2);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import type { Param, SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";
import { Lfo } from "./internal/lfo";

export interface PhaserOptions extends EffectOptions {
  frequency?: number; // LFO Hz, default 0.5
  octaves?: number; // sweep range above baseFrequency, default 3
  baseFrequency?: number; // default 350
  Q?: number; // default 10
  stages?: number; // allpass stages per channel, default 10
}

export class Phaser extends Effect<{ frequency: SchedulableParam; Q: SchedulableParam; octaves: Param<number>; baseFrequency: Param<number> }> {
  private readonly lfo: Lfo;
  private readonly qSource: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, opts: PhaserOptions = {}) {
    const stages = opts.stages ?? 10;
    const base = opts.baseFrequency ?? 350;
    const octaves = opts.octaves ?? 3;
    const entry = new GainNode(ctx, { channelCount: 2, channelCountMode: "explicit" });
    const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    entry.connect(splitter);
    const all: BiquadFilterNode[] = [];
    for (let ch = 0; ch < 2; ch++) {
      const chain = Array.from({ length: stages }, () => new BiquadFilterNode(ctx, { type: "allpass" }));
      for (let i = 1; i < chain.length; i++) chain[i - 1]!.connect(chain[i]!);
      splitter.connect(chain[0]!, ch);
      chain[chain.length - 1]!.connect(merger, 0, ch);
      all.push(...chain);
    }
    const lfo = new Lfo(ctx, { shape: "sine", frequency: opts.frequency ?? 0.5, min: base, max: base * 2 ** octaves });
    for (const f of all) lfo.connect(f.frequency);
    const q = fanout(
      ctx,
      opts.Q ?? 10,
      all.map((f) => f.Q),
    );

    let currentBase = base;
    let currentOctaves = octaves;
    const retune = () => lfo.setRange(currentBase, currentBase * 2 ** currentOctaves);

    super(
      ctx,
      { input: entry, output: merger },
      ({ param }) => ({
        params: {
          frequency: param({ default: opts.frequency ?? 0.5, bind: lfo.frequency, min: 0, max: 20 }),
          Q: param({ default: opts.Q ?? 10, bind: q.offset, min: 0.1, max: 100 }),
          octaves: param<number>({
            default: octaves,
            min: 0,
            max: 10,
            bind: {
              set: (v) => {
                currentOctaves = v;
                retune();
              },
            },
          }),
          baseFrequency: param<number>({
            default: base,
            min: 20,
            max: 10000,
            bind: {
              set: (v) => {
                currentBase = v;
                retune();
              },
            },
          }),
        },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    lfo.start();
    this.lfo = lfo;
    this.qSource = q;
  }

  override destroy(): void {
    this.lfo.disconnect();
    this.qSource.stop();
    this.qSource.disconnect();
    super.destroy();
  }
}
```

- [ ] **Step 4: Run, expect PASS.** The notch test's threshold (0.3) assumes four stages; if it is marginal, raise `Q` in the test rather than loosening the ratio.

- [ ] **Step 5: Commit** — `feat(effects): Phaser`

---

### Task 11: `FrequencyShifter`

**Files:**

- Create: `packages/effects/src/FrequencyShifter.ts`; Modify: `src/index.ts`; Test: `tests/frequencyShifter.test.ts`

**Interfaces:**

- Consumes: `phasedWave` (for the cosine oscillator).
- Produces: `interface FrequencyShifterOptions extends EffectOptions { frequency?: number }`, `class FrequencyShifter extends Effect<{ frequency: SchedulableParam }>`.

Hilbert transformer (Tone's `PhaseShiftAllpass`, Olli Niemitalo's coefficients): two chains of first-order-section IIR allpasses, `bank0` on `[0.6923878, 0.9360654322959, 0.9882295226860, 0.9987488452737]` followed by a one-sample delay (`createIIRFilter([0, 1], [1, 0])`) giving the 90° branch, `bank1` on `[0.4021921162426, 0.8561710882420, 0.9722909545651, 0.9952884791278]` giving the 180° branch. Each section is `createIIRFilter([a², 0, -1], [1, 0, -a²])`. Then `out = branch90 · cos(ωt) − branch180 · sin(ωt)`. Multiplication is a `GainNode` with `gain = 0` and the oscillator connected to `gain`. Cosine = `phasedWave("sine", 90)`. Both oscillators' `frequency` are driven by one fan-out so the param binds once; negative values are legal on `OscillatorNode.frequency` and flip the sine's sign, which selects the lower sideband.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { FrequencyShifter } from "../src";

function magnitude(frame: Float32Array, freq: number, sr: number): number {
  let re = 0,
    im = 0;
  for (let n = 0; n < frame.length; n++) {
    const w = (2 * Math.PI * freq * n) / sr;
    re += frame[n]! * Math.cos(w);
    im -= frame[n]! * Math.sin(w);
  }
  return Math.hypot(re, im) / frame.length;
}
async function shifted(shift: number) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const fx = new FrequencyShifter(ctx, { frequency: shift });
  const osc = new OscillatorNode(ctx, { frequency: 440 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0).subarray(22050, 22050 + 8820); // 0.2 s frame → 5 Hz bins
}
const db = (a: number, b: number) => 20 * Math.log10(a / b);

describe("FrequencyShifter", () => {
  it("+100 Hz moves 440 → 540 with the 340 Hz image ≥ 30 dB down", async () => {
    const f = await shifted(100);
    const up = magnitude(f, 540, 44100),
      down = magnitude(f, 340, 44100),
      orig = magnitude(f, 440, 44100);
    expect(db(down, up)).toBeLessThan(-30);
    expect(db(orig, up)).toBeLessThan(-30);
  });
  it("−100 Hz selects the lower sideband", async () => {
    const f = await shifted(-100);
    expect(db(magnitude(f, 540, 44100), magnitude(f, 340, 44100))).toBeLessThan(-30);
  });
  it("0 Hz passes the tone (allowing the Hilbert phase shift)", async () => {
    const f = await shifted(0);
    expect(magnitude(f, 440, 44100)).toBeGreaterThan(0.4);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```ts
import type { SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { fanout } from "./internal/fanout";
import { phasedWave } from "./internal/lfo";

export interface FrequencyShifterOptions extends EffectOptions {
  /** Shift in Hz; negative selects the lower sideband. Default 0. */
  frequency?: number;
}

const BANK_90 = [0.6923878, 0.9360654322959, 0.988229522686, 0.9987488452737];
const BANK_180 = [0.4021921162426, 0.856171088242, 0.9722909545651, 0.9952884791278];

function allpassChain(ctx: BaseAudioContext, coefficients: number[]): { input: AudioNode; output: AudioNode } {
  const sections = coefficients.map((a) => ctx.createIIRFilter([a * a, 0, -1], [1, 0, -(a * a)]));
  for (let i = 1; i < sections.length; i++) sections[i - 1]!.connect(sections[i]!);
  return { input: sections[0]!, output: sections[sections.length - 1]! };
}

export class FrequencyShifter extends Effect<{ frequency: SchedulableParam }> {
  private readonly oscillators: OscillatorNode[];
  private readonly freqSource: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, opts: FrequencyShifterOptions = {}) {
    const entry = new GainNode(ctx);
    const b90 = allpassChain(ctx, BANK_90);
    const oneSample = ctx.createIIRFilter([0, 1], [1, 0]);
    const b180 = allpassChain(ctx, BANK_180);
    entry.connect(b90.input);
    b90.output.connect(oneSample);
    entry.connect(b180.input);

    const sine = new OscillatorNode(ctx, { frequency: 0 });
    const cosine = new OscillatorNode(ctx, { frequency: 0, periodicWave: phasedWave(ctx, "sine", 90) });
    const mulCos = new GainNode(ctx, { gain: 0 });
    const mulSin = new GainNode(ctx, { gain: 0 });
    const negate = new GainNode(ctx, { gain: -1 });
    const sum = new GainNode(ctx);
    oneSample.connect(mulCos);
    cosine.connect(mulCos.gain);
    mulCos.connect(sum);
    b180.output.connect(mulSin);
    sine.connect(mulSin.gain);
    mulSin.connect(negate);
    negate.connect(sum);

    const freq = fanout(ctx, opts.frequency ?? 0, [sine.frequency, cosine.frequency]);

    super(
      ctx,
      { input: entry, output: sum },
      ({ param }) => ({
        params: { frequency: param({ default: opts.frequency ?? 0, bind: freq.offset, min: -5000, max: 5000 }) },
        cells: {},
        latency: 0,
      }),
      opts,
    );
    sine.start();
    cosine.start();
    this.oscillators = [sine, cosine];
    this.freqSource = freq;
  }

  override destroy(): void {
    for (const o of this.oscillators) {
      o.stop();
      o.disconnect();
    }
    this.freqSource.stop();
    this.freqSource.disconnect();
    super.destroy();
  }
}
```

- [ ] **Step 4: Run, expect PASS.** If the upper/lower sideband is swapped, swap which branch feeds `mulCos` vs `mulSin` (the two banks differ only in which gets the extra one-sample delay); the test pins the correct orientation.

- [ ] **Step 5: Commit** — `feat(effects): FrequencyShifter (Hilbert allpass pair)`

---

### Task 12: `PitchShift` with the granular engine

**Files:**

- Create: `packages/effects/src/pitch/GranularShifter.ts`, `packages/effects/src/PitchShift.ts`; Modify: `src/index.ts`; Test: `tests/pitchShift.test.ts`

**Interfaces:**

- Consumes: `Lfo`, `fanout`.
- Produces:

```ts
// pitch/GranularShifter.ts — the wet arm, a plain AudioProcessor
interface GranularShifterOptions {
  pitch?: number;
  windowSize?: number;
}
class GranularShifter extends AudioProcessor {
  readonly input: GainNode;
  readonly output: GainNode;
  setPitch(semitones: number): void;
}
// PitchShift.ts
type PitchShiftEngine = "granular" | "stretch";
interface StretchOptions {
  tonalityHz?: number;
  formantCompensation?: boolean;
  formantSemitones?: number;
  blockMs?: number;
}
interface PitchShiftOptions extends EffectOptions {
  pitch?: number;
  engine?: PitchShiftEngine;
  windowSize?: number;
  stretch?: StretchOptions;
}
class PitchShift extends Effect<{ pitch: Param<number> }, { isReady: Cell<boolean> }> {
  readonly engine: PitchShiftEngine;
  readonly ready: Promise<void>;
}
```

Granular engine (Tone's): input fans to `delayA` and `delayB`; each `delayTime` is driven by a sawtooth `Lfo` (B at 180°) over `[0, windowSize]` (pitch down) or `[windowSize, 0]` (pitch up); a crossfade `Lfo` (triangle, 90°, `[0, 1]`) drives `gainA.gain` and, via `1 − x` (constant 1 summed with the crossfade through a `Gain(−1)`), `gainB.gain`. All three LFO `frequency`s are one fan-out set to `factor · 1.2 / windowSize` where `factor = 2^((pitch−1)/12) + 1` for `pitch < 0` and `2^(pitch/12) − 1` otherwise. Declared latency: `round(windowSize · sampleRate)`.

In this task `PitchShift` supports only `engine: "granular"`; passing `"stretch"` throws `Error("PitchShift: stretch engine arrives in Task 16")`. Task 16 replaces that throw.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PitchShift } from "../src";

function dominantHz(frame: Float32Array, sr: number, lo = 200, hi = 1200): number {
  let best = 0,
    bestMag = 0;
  for (let f = lo; f <= hi; f += 5) {
    let re = 0,
      im = 0;
    for (let n = 0; n < frame.length; n++) {
      const w = (2 * Math.PI * f * n) / sr;
      re += frame[n]! * Math.cos(w);
      im -= frame[n]! * Math.sin(w);
    }
    const m = Math.hypot(re, im);
    if (m > bestMag) {
      bestMag = m;
      best = f;
    }
  }
  return best;
}
export async function renderShift(build: (ctx: OfflineAudioContext) => PitchShift): Promise<Float32Array> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, sr, sr);
  const fx = build(ctx);
  await fx.ready;
  const osc = new OscillatorNode(ctx, { frequency: 440 });
  osc.connect(fx.input);
  fx.output.connect(ctx.destination);
  osc.start();
  return (await ctx.startRendering()).getChannelData(0).subarray(22050, 22050 + 8820);
}

describe("PitchShift (granular)", () => {
  it("+12 semitones doubles the dominant frequency (± one 5 Hz bin, granular smear allowed)", async () => {
    const f = await renderShift((ctx) => new PitchShift(ctx, { pitch: 12 }));
    expect(Math.abs(dominantHz(f, 44100) - 880)).toBeLessThanOrEqual(15);
  });
  it("−12 semitones halves it", async () => {
    const f = await renderShift((ctx) => new PitchShift(ctx, { pitch: -12 }));
    expect(Math.abs(dominantHz(f, 44100, 100, 600) - 220)).toBeLessThanOrEqual(15);
  });
  it("pitch 0 leaves 440 in place and isReady is immediate; latency is the window", async () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const fx = new PitchShift(ctx, { windowSize: 0.05 });
    expect(fx.cells.isReady.value).toBe(true);
    expect(fx.latency.value).toBe(Math.round(0.05 * 44100));
    const f = await renderShift((c) => new PitchShift(c, { pitch: 0 }));
    expect(Math.abs(dominantHz(f, 44100) - 440)).toBeLessThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`pitch/GranularShifter.ts`:

```ts
import { AudioProcessor } from "@audiorective/core";
import { fanout } from "../internal/fanout";
import { Lfo } from "../internal/lfo";

export interface GranularShifterOptions {
  pitch?: number;
  windowSize?: number;
}

/** Two delay lines swept by out-of-phase sawtooths and crossfaded — Tone.js's PitchShift core. */
export class GranularShifter extends AudioProcessor {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly windowSize: number;
  private readonly lfoA: Lfo;
  private readonly lfoB: Lfo;
  private readonly fade: Lfo;
  private readonly rate: ConstantSourceNode;
  private readonly one: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, opts: GranularShifterOptions = {}) {
    const windowSize = opts.windowSize ?? 0.1;
    const input = new GainNode(ctx),
      output = new GainNode(ctx);
    const delayA = new DelayNode(ctx, { maxDelayTime: 1 }),
      delayB = new DelayNode(ctx, { maxDelayTime: 1 });
    const gainA = new GainNode(ctx, { gain: 0 }),
      gainB = new GainNode(ctx, { gain: 0 });
    const one = new ConstantSourceNode(ctx, { offset: 1 });
    const invert = new GainNode(ctx, { gain: -1 });
    input.connect(delayA);
    input.connect(delayB);
    delayA.connect(gainA);
    delayB.connect(gainB);
    gainA.connect(output);
    gainB.connect(output);

    const lfoA = new Lfo(ctx, { shape: "sawtooth", frequency: 0, min: 0, max: windowSize });
    const lfoB = new Lfo(ctx, { shape: "sawtooth", phaseDeg: 180, frequency: 0, min: 0, max: windowSize });
    const fade = new Lfo(ctx, { shape: "triangle", phaseDeg: 90, frequency: 0, min: 0, max: 1 });
    lfoA.connect(delayA.delayTime);
    lfoB.connect(delayB.delayTime);
    fade.connect(gainA.gain);
    // gainB = 1 − fade: the fade signal through a −1 gain, summed with a constant 1
    fade.connectNode(invert);
    invert.connect(gainB.gain);
    one.connect(gainB.gain);
    const rate = fanout(ctx, 0, [lfoA.frequency, lfoB.frequency, fade.frequency]);

    super(ctx, () => ({ latency: Math.round(windowSize * ctx.sampleRate) }));
    this.input = input;
    this.output = output;
    this.windowSize = windowSize;
    this.lfoA = lfoA;
    this.lfoB = lfoB;
    this.fade = fade;
    this.rate = rate;
    this.one = one;
    one.start();
    lfoA.start();
    lfoB.start();
    fade.start();
    this.setPitch(opts.pitch ?? 0);
  }

  setPitch(semitones: number): void {
    let factor: number;
    if (semitones < 0) {
      this.lfoA.setRange(0, this.windowSize);
      this.lfoB.setRange(0, this.windowSize);
      factor = 2 ** ((semitones - 1) / 12) + 1;
    } else {
      this.lfoA.setRange(this.windowSize, 0);
      this.lfoB.setRange(this.windowSize, 0);
      factor = 2 ** (semitones / 12) - 1;
    }
    this.rate.offset.value = (factor * 1.2) / this.windowSize;
  }

  override destroy(): void {
    for (const l of [this.lfoA, this.lfoB, this.fade]) l.disconnect();
    this.rate.stop();
    this.rate.disconnect();
    this.one.stop();
    this.one.disconnect();
    super.destroy();
  }
}
```

`Lfo.connect(target: AudioParam)` targets params only, so add to `internal/lfo.ts` in this task:

```ts
  /** Feeds the LFO into a node's signal input (for arithmetic on the LFO itself). */
  connectNode(target: AudioNode): void {
    this.depth.connect(target);
    this.centre.connect(target);
  }
```

`PitchShift.ts`:

```ts
import type { Cell, Param } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { GranularShifter } from "./pitch/GranularShifter";

export type PitchShiftEngine = "granular" | "stretch";
export interface StretchOptions {
  tonalityHz?: number;
  formantCompensation?: boolean;
  formantSemitones?: number;
  blockMs?: number;
}
export interface PitchShiftOptions extends EffectOptions {
  pitch?: number; // semitones, default 0
  engine?: PitchShiftEngine; // default "granular"
  windowSize?: number; // granular grain, seconds, default 0.1
  stretch?: StretchOptions;
}

export class PitchShift extends Effect<{ pitch: Param<number> }, { isReady: Cell<boolean> }> {
  readonly engine: PitchShiftEngine;
  readonly ready: Promise<void>;

  constructor(ctx: BaseAudioContext, opts: PitchShiftOptions = {}) {
    const engine = opts.engine ?? "granular";
    if (engine !== "granular") throw new Error("PitchShift: stretch engine arrives in Task 16");
    const core = new GranularShifter(ctx, { pitch: opts.pitch ?? 0, windowSize: opts.windowSize });
    super(
      ctx,
      { input: core, output: core },
      ({ param, cell }) => ({
        params: { pitch: param<number>({ default: opts.pitch ?? 0, min: -24, max: 24, bind: { set: (v) => core.setPitch(v) } }) },
        cells: { isReady: cell(true) },
      }),
      opts,
    );
    this.engine = engine;
    this.ready = Promise.resolve();
  }
}
```

Exports: `PitchShift`, types `PitchShiftOptions`, `PitchShiftEngine`, `StretchOptions`.

- [ ] **Step 4: Run, expect PASS.** Latency derives from the `GranularShifter` arm (declared), so `fx.latency.value` equals the window in samples without `PitchShift` declaring anything.

- [ ] **Step 5: Commit** — `feat(effects): PitchShift with granular engine`

---

### Task 13: Dynamics worklet and `DynamicsCore`

**Files:**

- Create: `packages/effects/src/worklets/dynamics.worklet.ts`, `packages/effects/src/dynamics/DynamicsCore.ts`
- Test: `packages/effects/tests/dynamicsCore.test.ts`

**Interfaces:**

- Consumes: `registerWorklet`.
- Produces:

```ts
export const DYNAMICS_WORKLET_NAME = "audiorective-dynamics";
export const DYNAMICS_WORKLET: string;
interface DynamicsCoreOptions {
  threshold: number;
  ratio: number;
  knee: number;
  attack: number;
  release: number;
  makeup: number;
  lookahead: number;
}
class DynamicsCore extends AudioProcessor<
  {
    threshold: SchedulableParam;
    ratio: SchedulableParam;
    knee: SchedulableParam;
    attack: SchedulableParam;
    release: SchedulableParam;
    makeup: SchedulableParam;
  },
  { reduction: Cell<number>; isReady: Cell<boolean> }
> {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly ready: Promise<void>;
}
```

`DynamicsCore` constructs synchronously with `input`/`output` gains and declared `latency = round(lookahead · sampleRate)`. It calls `registerWorklet`, then creates the `AudioWorkletNode` (`processorOptions: { lookaheadSamples }`, `outputChannelCount: [2]`), rebinds each `SchedulableParam` to the node's `AudioParam` via `rebind(param, { reassert: true })`, wires `input → node → output`, listens on `port` for `{ reduction }` messages into the cell, and sets `isReady`. Params are created unbound first (`schedulableParam({ default })`) so they exist before the node does.

Worklet DSP per frame (stereo-linked): with lookahead `L` samples, write both channels into rings; detector level `x = max(|ring[read..read+L]|)` over both channels (when `L = 0`, `x = max(|inL|, |inR|)`); `xdb = 20·log10(max(x, 1e-6))`; gain computer with `T`, `R` (ratio ≥ 1, `Infinity` allowed → slope 0), knee `W`:

```
over = xdb − T
if 2·over < −W:  ydb = xdb
elif 2·|over| ≤ W: ydb = xdb + (1/R − 1) · (over + W/2)² / (2W)
else:             ydb = T + over / R
gr = xdb − ydb            // ≥ 0 dB of reduction wanted
```

Smoothing: `env = gr > env ? aA·env + (1−aA)·gr : aR·env + (1−aR)·gr`, `aA = exp(−1/(attack·sr))`, `aR = exp(−1/(release·sr))` (attack `0` → `aA = 0`). Output sample = delayed sample × `10^((makeup − env)/20)`. Post `{ reduction: −maxEnvSinceLastPost }` every 2048 frames. Parameters: `threshold`(−100..0, default −24), `ratio`(1..Infinity? AudioParam can't hold Infinity — use `maxValue: 1000` and treat `≥ 1000` as infinite), `knee`(0..40), `attack`(0..1), `release`(0..5), `makeup`(0..40), all k-rate.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { DynamicsCore } from "../src/dynamics/DynamicsCore";

async function renderThrough(opts: ConstructorParameters<typeof DynamicsCore>[1], amplitude: number, seconds = 1) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const core = new DynamicsCore(ctx, opts);
  await core.ready;
  const osc = new OscillatorNode(ctx, { frequency: 1000 });
  const g = new GainNode(ctx, { gain: amplitude });
  osc.connect(g);
  g.connect(core.input);
  core.output.connect(ctx.destination);
  osc.start();
  const buf = await ctx.startRendering();
  return { buf, core };
}
const peakFrom = (d: Float32Array, from: number) => {
  let m = 0;
  for (let i = from; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!));
  return m;
};
const db = (x: number) => 20 * Math.log10(x);

describe("DynamicsCore", () => {
  it("below threshold is unity", async () => {
    const { buf } = await renderThrough({ threshold: -6, ratio: 4, knee: 0, attack: 0.001, release: 0.05, makeup: 0, lookahead: 0 }, 0.1);
    expect(peakFrom(buf.getChannelData(0), 22050)).toBeCloseTo(0.1, 3);
  });
  it("ratio 4 above threshold settles to the gain-computer value ±0.1 dB", async () => {
    // input −6 dBFS peak, threshold −24, ratio 4 → output = −24 + 18/4 = −19.5 dBFS
    const { buf } = await renderThrough({ threshold: -24, ratio: 4, knee: 0, attack: 0.001, release: 0.05, makeup: 0, lookahead: 0 }, 0.5);
    expect(db(peakFrom(buf.getChannelData(0), 22050))).toBeCloseTo(-19.5, 1);
  });
  it("makeup adds gain and reduction is reported", async () => {
    const { buf, core } = await renderThrough({ threshold: -24, ratio: 4, knee: 0, attack: 0.001, release: 0.05, makeup: 6, lookahead: 0 }, 0.5);
    expect(db(peakFrom(buf.getChannelData(0), 22050))).toBeCloseTo(-13.5, 1);
    expect(core.cells.reduction.value).toBeLessThan(-12);
  });
  it("lookahead delays the signal by exactly lookahead samples and declares it", async () => {
    const sr = 44100;
    const ctx = new OfflineAudioContext(2, 2048, sr);
    const core = new DynamicsCore(ctx, { threshold: 0, ratio: 1, knee: 0, attack: 0, release: 0.1, makeup: 0, lookahead: 0.005 });
    await core.ready;
    expect(core.latency.value).toBe(Math.round(0.005 * sr));
    const imp = ctx.createBuffer(1, 1, sr);
    imp.getChannelData(0)[0] = 1;
    const s = new AudioBufferSourceNode(ctx, { buffer: imp });
    s.connect(core.input);
    core.output.connect(ctx.destination);
    s.start();
    const d = (await ctx.startRendering()).getChannelData(0);
    let idx = -1;
    for (let i = 0; i < d.length; i++)
      if (Math.abs(d[i]!) > 0.5) {
        idx = i;
        break;
      }
    expect(idx).toBe(Math.round(0.005 * sr));
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`worklets/dynamics.worklet.ts`:

```ts
export const DYNAMICS_WORKLET_NAME = "audiorective-dynamics";

export const DYNAMICS_WORKLET = /* js */ `
const RATIO_INFINITE = 1000;
class DynamicsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -24, minValue: -100, maxValue: 0, automationRate: "k-rate" },
      { name: "ratio", defaultValue: 4, minValue: 1, maxValue: RATIO_INFINITE, automationRate: "k-rate" },
      { name: "knee", defaultValue: 6, minValue: 0, maxValue: 40, automationRate: "k-rate" },
      { name: "attack", defaultValue: 0.003, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "release", defaultValue: 0.25, minValue: 0.001, maxValue: 5, automationRate: "k-rate" },
      { name: "makeup", defaultValue: 0, minValue: 0, maxValue: 40, automationRate: "k-rate" },
    ];
  }
  constructor(options) {
    super();
    this.lookahead = Math.max(0, Math.round(options.processorOptions?.lookaheadSamples ?? 0));
    const size = this.lookahead + 128;
    this.rings = [new Float32Array(size), new Float32Array(size)];
    this.write = 0;
    this.env = 0;
    this.maxEnv = 0;
    this.sinceReport = 0;
  }
  process(inputs, outputs, p) {
    const input = inputs[0], output = outputs[0];
    const n = output[0].length;
    const T = p.threshold[0], R = p.ratio[0] >= RATIO_INFINITE ? Infinity : p.ratio[0], W = p.knee[0];
    const aA = p.attack[0] <= 0 ? 0 : Math.exp(-1 / (p.attack[0] * sampleRate));
    const aR = Math.exp(-1 / (p.release[0] * sampleRate));
    const makeup = p.makeup[0];
    const L = this.lookahead, rings = this.rings, size = rings[0].length;
    const inL = input[0], inR = input[1] ?? input[0];
    for (let i = 0; i < n; i++) {
      const w = (this.write + i) % size;
      rings[0][w] = inL ? inL[i] : 0;
      rings[1][w] = inR ? inR[i] : 0;
      // detector: peak over the lookahead window ending at the sample just written
      let x = 0;
      if (L === 0) {
        x = Math.max(Math.abs(rings[0][w]), Math.abs(rings[1][w]));
      } else {
        for (let k = 0; k <= L; k++) {
          const idx = (w - k + size) % size;
          const a = Math.abs(rings[0][idx]), b = Math.abs(rings[1][idx]);
          if (a > x) x = a; if (b > x) x = b;
        }
      }
      const xdb = 20 * Math.log10(Math.max(x, 1e-6));
      const over = xdb - T;
      let ydb;
      if (2 * over < -W) ydb = xdb;
      else if (2 * Math.abs(over) <= W) ydb = xdb + ((1 / R - 1) * (over + W / 2) * (over + W / 2)) / (2 * W);
      else ydb = T + over / R;
      const gr = xdb - ydb;
      this.env = gr > this.env ? aA * this.env + (1 - aA) * gr : aR * this.env + (1 - aR) * gr;
      if (this.env > this.maxEnv) this.maxEnv = this.env;
      const gain = Math.pow(10, (makeup - this.env) / 20);
      const r = (w - L + size) % size;
      output[0][i] = rings[0][r] * gain;
      if (output[1]) output[1][i] = rings[1][r] * gain;
    }
    this.write = (this.write + n) % size;
    this.sinceReport += n;
    if (this.sinceReport >= 2048) {
      this.port.postMessage({ reduction: -this.maxEnv });
      this.maxEnv = 0; this.sinceReport = 0;
    }
    return true;
  }
}
registerProcessor("${DYNAMICS_WORKLET_NAME}", DynamicsProcessor);
`;
```

Note `1/R` with `R = Infinity` is `0`, so the knee and slope formulas need no special case. `ring size = L + 128` guarantees the read head never overtakes the block being written.

`dynamics/DynamicsCore.ts`:

```ts
import { AudioProcessor, type Cell, type SchedulableParam } from "@audiorective/core";
import { registerWorklet } from "../registerWorklet";
import { DYNAMICS_WORKLET, DYNAMICS_WORKLET_NAME } from "../worklets/dynamics.worklet";

export interface DynamicsCoreOptions {
  threshold: number;
  ratio: number;
  knee: number;
  attack: number;
  release: number;
  makeup: number;
  lookahead: number;
}

type P = {
  threshold: SchedulableParam;
  ratio: SchedulableParam;
  knee: SchedulableParam;
  attack: SchedulableParam;
  release: SchedulableParam;
  makeup: SchedulableParam;
};

/** Worklet-backed compressor core. Constructs synchronously; the node arrives when `ready` resolves. */
export class DynamicsCore extends AudioProcessor<P, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly ready: Promise<void>;
  private node: AudioWorkletNode | null = null;

  constructor(ctx: BaseAudioContext, opts: DynamicsCoreOptions) {
    const input = new GainNode(ctx),
      output = new GainNode(ctx);
    const lookaheadSamples = Math.round(opts.lookahead * ctx.sampleRate);
    super(ctx, ({ schedulableParam, cell }) => ({
      params: {
        threshold: schedulableParam({ default: opts.threshold, min: -100, max: 0 }),
        ratio: schedulableParam({ default: Number.isFinite(opts.ratio) ? opts.ratio : 1000, min: 1, max: 1000 }),
        knee: schedulableParam({ default: opts.knee, min: 0, max: 40 }),
        attack: schedulableParam({ default: opts.attack, min: 0, max: 1 }),
        release: schedulableParam({ default: opts.release, min: 0.001, max: 5 }),
        makeup: schedulableParam({ default: opts.makeup, min: 0, max: 40 }),
      },
      cells: { reduction: cell(0), isReady: cell(false) },
      latency: lookaheadSamples,
    }));
    this.input = input;
    this.output = output;

    this.ready = registerWorklet(ctx, DYNAMICS_WORKLET_NAME, DYNAMICS_WORKLET).then(() => {
      const node = new AudioWorkletNode(ctx, DYNAMICS_WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { lookaheadSamples },
      });
      for (const key of Object.keys(this.params) as (keyof P)[]) {
        this.params[key].rebind(node.parameters.get(key)!, { reassert: true });
      }
      node.port.onmessage = (e: MessageEvent<{ reduction: number }>) => {
        this.cells.reduction.value = e.data.reduction;
      };
      input.connect(node);
      node.connect(output);
      this.node = node;
      this.cells.isReady.value = true;
    });
  }

  override destroy(): void {
    if (this.node) {
      this.node.port.close();
      this.node.disconnect();
    }
    super.destroy();
  }
}
```

`rebind(..., { reassert: true })` re-applies the param's current value to the new `AudioParam`, so the `ratio = Infinity → 1000` mapping and any value set before `ready` land on the node.

- [ ] **Step 4: Run, expect PASS.** The ratio-4 test allows ±0.1 dB; the 1 ms attack on a 1 kHz sine leaves a little ripple, measured as peak over the second half so it settles.

- [ ] **Step 5: Commit** — `feat(effects): dynamics worklet and DynamicsCore`

---

### Task 14: `Compressor` and `Limiter`

**Files:**

- Create: `packages/effects/src/Compressor.ts`, `packages/effects/src/Limiter.ts`; Modify: `src/index.ts`; Test: `tests/compressorLimiter.test.ts`

**Interfaces:**

- Consumes: `DynamicsCore`.
- Produces:

```ts
interface CompressorOptions extends EffectOptions {
  threshold?: number;
  ratio?: number;
  knee?: number;
  attack?: number;
  release?: number;
  makeup?: number;
  lookahead?: number;
}
class Compressor extends Effect<{ threshold; ratio; knee; attack; release; makeup }, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly ready: Promise<void>;
}
interface LimiterOptions extends EffectOptions {
  threshold?: number;
  release?: number;
  lookahead?: number;
}
class Limiter extends Effect<{ threshold: SchedulableParam; release: SchedulableParam }, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly ready: Promise<void>;
}
```

Both pass the core's params/cells straight through (`Compressor` all six; `Limiter` only `threshold` and `release`, keeping the others fixed: ratio `Infinity`, knee `0`, attack `0.001`, makeup `0`). Latency derives from the core arm.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Compressor, Limiter } from "../src";

const db = (x: number) => 20 * Math.log10(x);
async function renderNoise(build: (ctx: OfflineAudioContext) => Compressor | Limiter, gain: number) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr, sr);
  const fx = build(ctx);
  await fx.ready;
  const noise = ctx.createBuffer(2, sr, sr);
  for (let c = 0; c < 2; c++) {
    const d = noise.getChannelData(c);
    let seed = 7 + c;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * gain;
    }
  }
  const src = new AudioBufferSourceNode(ctx, { buffer: noise });
  src.connect(fx.input);
  fx.output.connect(ctx.destination);
  src.start();
  return { buf: await ctx.startRendering(), fx };
}

describe("Limiter", () => {
  it("+6 dBFS noise never exceeds threshold + 0.1 dB after the lookahead settles", async () => {
    const { buf, fx } = await renderNoise((ctx) => new Limiter(ctx, { threshold: -1 }), 2);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let peak = 0;
      for (let i = 1000; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
      expect(db(peak)).toBeLessThanOrEqual(-1 + 0.1);
    }
    expect(fx.latency.value).toBe(Math.round(0.005 * 44100));
    expect(fx.cells.reduction.value).toBeLessThan(-5);
  });
});

describe("Compressor", () => {
  it("exposes all six params and reports reduction", async () => {
    const { fx } = await renderNoise((ctx) => new Compressor(ctx, { threshold: -30, ratio: 8 }), 0.5);
    expect(Object.keys(fx.params).sort()).toEqual(["attack", "knee", "makeup", "ratio", "release", "threshold", "wet"]);
    expect(fx.cells.reduction.value).toBeLessThan(-10);
  });
  it("wet = 0 bypasses (dry aligned through the compensated graph)", async () => {
    const { buf } = await renderNoise((ctx) => new Compressor(ctx, { threshold: -40, ratio: 20, lookahead: 0.002, wet: 0 }), 0.5);
    let peak = 0;
    const d = buf.getChannelData(0);
    for (let i = 1000; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
    expect(peak).toBeGreaterThan(0.45);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`Compressor.ts`:

```ts
import type { Cell, SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { DynamicsCore } from "./dynamics/DynamicsCore";

export interface CompressorOptions extends EffectOptions {
  threshold?: number;
  ratio?: number;
  knee?: number;
  attack?: number;
  release?: number;
  makeup?: number;
  lookahead?: number;
}
type P = {
  threshold: SchedulableParam;
  ratio: SchedulableParam;
  knee: SchedulableParam;
  attack: SchedulableParam;
  release: SchedulableParam;
  makeup: SchedulableParam;
};

export class Compressor extends Effect<P, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly ready: Promise<void>;
  constructor(ctx: BaseAudioContext, opts: CompressorOptions = {}) {
    const core = new DynamicsCore(ctx, {
      threshold: opts.threshold ?? -24,
      ratio: opts.ratio ?? 4,
      knee: opts.knee ?? 6,
      attack: opts.attack ?? 0.003,
      release: opts.release ?? 0.25,
      makeup: opts.makeup ?? 0,
      lookahead: opts.lookahead ?? 0,
    });
    super(ctx, { input: core, output: core }, () => ({ params: { ...core.params }, cells: { ...core.cells } }), opts);
    this.ready = core.ready;
    this.core = core;
  }
  private readonly core: DynamicsCore;
  override destroy(): void {
    this.core.destroy();
    super.destroy();
  }
}
```

Passing the core's `Param` instances through means `Effect.destroy()` destroys them once via `this.params`; `DynamicsCore.destroy()` would destroy them again. `Param.destroy()` is idempotent (it clears its effect handle), so the double call is safe; the same applies to `Limiter`.

`Limiter.ts`:

```ts
import type { Cell, SchedulableParam } from "@audiorective/core";
import { Effect, type EffectOptions } from "./Effect";
import { DynamicsCore } from "./dynamics/DynamicsCore";

export interface LimiterOptions extends EffectOptions {
  threshold?: number;
  release?: number;
  lookahead?: number;
}

/** Brickwall: infinite ratio, hard knee, windowed-peak detection over `lookahead`. */
export class Limiter extends Effect<{ threshold: SchedulableParam; release: SchedulableParam }, { reduction: Cell<number>; isReady: Cell<boolean> }> {
  readonly ready: Promise<void>;
  private readonly core: DynamicsCore;
  constructor(ctx: BaseAudioContext, opts: LimiterOptions = {}) {
    const core = new DynamicsCore(ctx, {
      threshold: opts.threshold ?? -1,
      ratio: Infinity,
      knee: 0,
      attack: 0.001,
      release: opts.release ?? 0.05,
      makeup: 0,
      lookahead: opts.lookahead ?? 0.005,
    });
    super(
      ctx,
      { input: core, output: core },
      () => ({ params: { threshold: core.params.threshold, release: core.params.release }, cells: { ...core.cells } }),
      opts,
    );
    this.ready = core.ready;
    this.core = core;
  }
  override destroy(): void {
    this.core.destroy();
    super.destroy();
  }
}
```

- [ ] **Step 4: Run, expect PASS.** If the limiter overshoots by more than 0.1 dB at onsets, the cause is the 1 ms attack; confirm by setting attack `0` in a scratch run, then keep `0.001` and widen the test's settle-skip (`i = 1000`) rather than the dB tolerance.

- [ ] **Step 5: Commit** — `feat(effects): Compressor and Limiter over the dynamics core`

---

### Task 15: `renderOffline` in core

**Files:**

- Create: `packages/core/src/renderOffline.ts`
- Modify: `packages/core/src/index.ts`, `docs/core.md` (after the FilePlayer section, before `## Usage Examples`), `CHANGELOG.md` (Unreleased → Added)
- Test: `packages/core/tests/renderOffline.test.ts`

**Interfaces:**

- Produces: `renderOffline(options: { seconds: number; channels?: number; sampleRate?: number }, setup: (ctx: OfflineAudioContext) => void | Promise<void>): Promise<AudioBuffer>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { Sampler, renderOffline } from "../src";

describe("renderOffline", () => {
  it("renders the requested length at the requested rate and awaits async setup", async () => {
    const buf = await renderOffline({ seconds: 0.5, channels: 1, sampleRate: 48000 }, async (ctx) => {
      await new Promise((r) => setTimeout(r, 5));
      const hit = ctx.createBuffer(1, 480, 48000);
      hit.getChannelData(0).fill(0.5);
      const s = new Sampler(ctx);
      s.buffer = hit;
      s.output.connect(ctx.destination);
      s.trigger({ when: 0.1 });
    });
    expect(buf.sampleRate).toBe(48000);
    expect(buf.length).toBe(24000);
    expect(buf.numberOfChannels).toBe(1);
    expect(buf.getChannelData(0)[4800 + 100]).toBeCloseTo(0.5, 5);
    expect(buf.getChannelData(0)[100]).toBe(0);
  });
  it("defaults to stereo at 44.1 kHz", async () => {
    const buf = await renderOffline({ seconds: 0.01 }, () => {});
    expect(buf.numberOfChannels).toBe(2);
    expect(buf.sampleRate).toBe(44100);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @audiorective/core test -- --run tests/renderOffline.test.ts`, expect FAIL.

- [ ] **Step 3: Implement**

```ts
export interface RenderOfflineOptions {
  seconds: number;
  /** Default 2. */
  channels?: number;
  /** Default 44100. */
  sampleRate?: number;
}

/**
 * Builds an OfflineAudioContext, runs `setup` against it (awaiting it, so
 * worklet-backed processors can finish loading), and returns the render.
 */
export async function renderOffline(options: RenderOfflineOptions, setup: (ctx: OfflineAudioContext) => void | Promise<void>): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 44100;
  const ctx = new OfflineAudioContext(options.channels ?? 2, Math.ceil(options.seconds * sampleRate), sampleRate);
  await setup(ctx);
  return ctx.startRendering();
}
```

`index.ts`: `export { renderOffline } from "./renderOffline"; export type { RenderOfflineOptions } from "./renderOffline";`

`docs/core.md` — add after FilePlayer:

````markdown
### `renderOffline`

Renders a graph to an `AudioBuffer` through an `OfflineAudioContext`. `setup` may be async — await any processor's `ready` inside it before returning.

​```typescript
import { renderOffline, Sampler } from "@audiorective/core";

const wav = await renderOffline({ seconds: 8, channels: 2, sampleRate: 44100 }, async (ctx) => {
const kick = new Sampler(ctx);
kick.buffer = await loadAudioBuffer(ctx, "/kick.wav");
kick.output.connect(ctx.destination);
for (let beat = 0; beat < 16; beat++) kick.trigger({ when: beat \* 0.5 });
});
​```

`Sampler`, `BufferPlayer`, and every `@audiorective/effects` processor accept a `BaseAudioContext`, so the same classes run live and offline.
````

`CHANGELOG.md` Unreleased → Added: `- **core:** \`renderOffline(options, setup)\` — builds an \`OfflineAudioContext\`, awaits an async setup callback, returns the rendered \`AudioBuffer\`.`

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** — `feat(core): renderOffline`

---

### Task 16: `PitchShift` stretch engine (Signalsmith)

**Files:**

- Create: `packages/effects/src/types/signalsmith-stretch.d.ts`, `packages/effects/src/pitch/StretchShifter.ts`
- Modify: `packages/effects/src/PitchShift.ts`, `packages/effects/tsconfig.json` (`"include": ["src", "tests"]` already covers the `.d.ts`)
- Test: `packages/effects/tests/pitchShiftStretch.test.ts`

**Interfaces:**

- Produces: `class StretchShifter extends AudioProcessor<{}, {}> { readonly input: GainNode; readonly output: GainNode; readonly ready: Promise<void>; setPitch(semitones: number): void }` with `latency: Param<number>` updated from `node.latency()`.
- `PitchShift` gains `engine: "stretch"` support; `isReady` and `ready` follow the arm.

`signalsmith-stretch` ships no types. Declaration:

```ts
declare module "signalsmith-stretch" {
  export interface StretchSchedule {
    output?: number;
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }
  export interface StretchNode extends AudioNode {
    schedule(change: StretchSchedule): void;
    start(when?: number): void;
    stop(when?: number): void;
    latency(): number;
    configure(opts: { blockMs?: number | null; intervalMs?: number; splitComputation?: boolean; preset?: "default" | "cheaper" }): void;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number } | void>;
  }
  export default function SignalsmithStretch(ctx: BaseAudioContext, channelOptions?: AudioWorkletNodeOptions): Promise<StretchNode>;
}
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { PitchShift } from "../src";
import { renderShift } from "./pitchShift.test"; // reuse the 440 Hz harness; export dominantHz too

function dominantHz(frame: Float32Array, sr: number, lo = 200, hi = 1200): number {
  /* copy from pitchShift.test.ts */
}

describe("PitchShift (stretch)", () => {
  it("+12 semitones doubles the dominant frequency within one bin", async () => {
    const f = await renderShift((ctx) => new PitchShift(ctx, { pitch: 12, engine: "stretch" }));
    expect(Math.abs(dominantHz(f, 44100) - 880)).toBeLessThanOrEqual(5);
  });
  it("reports isReady after load and a positive latency the graph adopts", async () => {
    const ctx = new OfflineAudioContext(2, 4096, 44100);
    const fx = new PitchShift(ctx, { engine: "stretch", stretch: { blockMs: 40 } });
    expect(fx.cells.isReady.value).toBe(false);
    await fx.ready;
    expect(fx.cells.isReady.value).toBe(true);
    expect(fx.latency.value).toBeGreaterThan(0);
    expect(fx.latency.value).toBeLessThan(0.2 * 44100);
  });
});
```

Move `dominantHz` and `renderShift` into `tests/helpers/spectrum.ts` and import them from both pitch tests instead of cross-importing test files.

- [ ] **Step 2: Run, expect FAIL** (`stretch engine arrives in Task 16` error).

- [ ] **Step 3: Implement**

`pitch/StretchShifter.ts`:

```ts
import { AudioProcessor, Param } from "@audiorective/core";
import SignalsmithStretch, { type StretchNode } from "signalsmith-stretch";
import type { StretchOptions } from "../PitchShift";

/** Signalsmith Stretch in live-input mode. Silent until `ready`; latency is read from the node. */
export class StretchShifter extends AudioProcessor {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly ready: Promise<void>;
  private node: StretchNode | null = null;
  private pitch: number;
  private readonly opts: StretchOptions;

  constructor(ctx: BaseAudioContext, pitch: number, opts: StretchOptions = {}) {
    const input = new GainNode(ctx),
      output = new GainNode(ctx);
    const latency = new Param<number>({ default: 0 });
    super(ctx, () => ({ latency }));
    this.input = input;
    this.output = output;
    this.pitch = pitch;
    this.opts = opts;

    this.ready = SignalsmithStretch(ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }).then((node) => {
      if (opts.blockMs !== undefined) node.configure({ blockMs: opts.blockMs });
      input.connect(node);
      node.connect(output);
      node.start();
      this.node = node;
      this.apply();
      latency.value = Math.round(node.latency() * ctx.sampleRate);
    });
  }

  private apply(): void {
    this.node?.schedule({
      semitones: this.pitch,
      tonalityHz: this.opts.tonalityHz,
      formantSemitones: this.opts.formantSemitones,
      formantCompensation: this.opts.formantCompensation,
    });
  }

  setPitch(semitones: number): void {
    this.pitch = semitones;
    this.apply();
  }

  override destroy(): void {
    if (this.node) {
      this.node.stop();
      this.node.disconnect();
    }
    this.latency.destroy();
    super.destroy();
  }
}
```

`PitchShift.ts` — replace the throw:

```ts
const core =
  engine === "stretch"
    ? new StretchShifter(ctx, opts.pitch ?? 0, opts.stretch)
    : new GranularShifter(ctx, { pitch: opts.pitch ?? 0, windowSize: opts.windowSize });
// …build: cells: { isReady: cell(engine === "granular") }
this.ready =
  core instanceof StretchShifter
    ? core.ready.then(() => {
        this.cells.isReady.value = true;
      })
    : Promise.resolve();
```

Both arms expose `setPitch`, so the `pitch` param's `bind.set` is unchanged.

- [ ] **Step 4: Run, expect PASS.** If `SignalsmithStretch` rejects on `OfflineAudioContext` in headless Chromium, check the console for a WASM MIME/CSP error first; the library loads from a Blob it creates itself, so this should not need any test config.

- [ ] **Step 5: Commit** — `feat(effects): PitchShift stretch engine via signalsmith-stretch`

---

### Task 17: Latency assertions across every processor

**Files:**

- Test: `packages/effects/tests/latency.test.ts`

Uses `assertLatency(build, opts)` from `@audiorective/devtools` (renders an impulse offline at 44.1 k and 48 k and compares first arrival against `latency.value`).

- [ ] **Step 1: Write the test**

```ts
import { describe, it } from "vitest";
import { assertLatency } from "@audiorective/devtools";
import { Channel, Compressor, Convolver, Distortion, Filter, FrequencyShifter, Limiter, Phaser, PingPongDelay, PitchShift } from "../src";

const rates = { sampleRates: [44100, 48000] };

describe("declared latency matches measured", () => {
  it("native effects are zero-latency", async () => {
    await assertLatency((ctx) => new Filter(ctx), rates);
    await assertLatency((ctx) => new Distortion(ctx), rates);
    await assertLatency((ctx) => new Phaser(ctx, { frequency: 0 }), rates);
    await assertLatency((ctx) => new FrequencyShifter(ctx), rates);
    await assertLatency((ctx) => new Channel(ctx), rates);
    // Convolver with a unit impulse IR; PingPongDelay with delayTime 0 (its delay is intentional, not latency)
    await assertLatency((ctx) => {
      const ir = ctx.createBuffer(1, 1, ctx.sampleRate);
      ir.getChannelData(0)[0] = 1;
      return new Convolver(ctx, { buffer: ir, normalize: false });
    }, rates);
    await assertLatency((ctx) => new PingPongDelay(ctx, { delayTime: 0, feedback: 0 }), rates);
  });
  it("worklet and granular effects declare their buffering", async () => {
    await assertLatency((ctx) => new Limiter(ctx), { ...rates, tolerance: 1 });
    await assertLatency((ctx) => new Compressor(ctx, { lookahead: 0.003 }), { ...rates, tolerance: 1 });
    await assertLatency((ctx) => new PitchShift(ctx, { windowSize: 0.02 }), { ...rates, tolerance: 0.1 * 0.02 * 44100 });
  });
});
```

`assertLatency` builds synchronously; for `Limiter`/`Compressor` the worklet must already be registered on the context it hands over. If `assertLatency` constructs the processor before rendering and awaits nothing, wrap: `await assertLatency((ctx) => { const l = new Limiter(ctx); return l; }, …)` will race. In that case extend the devtools `MeasureOptions` with an optional `ready?: (proc) => Promise<void>` awaited before `startRendering` — a one-line addition in `measureLatency.ts` and a changelog line — and pass `ready: (p) => (p as Limiter).ready`.

The granular shifter's first arrival is the _shortest_ delay-line path, which sweeps from 0 to `windowSize`; the impulse measurement therefore under-reads. Keep its assertion but set `tolerance` to the full window and add a comment; the meaningful check for it is Task 12's `latency.value` test.

- [ ] **Step 2: Run, expect PASS** (after any devtools `ready` addition).

- [ ] **Step 3: Commit** — `test(effects): assert declared latency for every processor`

---

### Task 18: Documentation, skill reference, changelog, README

**Files:**

- Create: `docs/effects.md`, `skills/audiorective/references/effects.md`
- Modify: `skills/audiorective/SKILL.md` (packages table row + "What to read next" row), `CHANGELOG.md`, `README.md` (packages table), `apps/web/astro.config.mjs` (sidebar `Packages` → `{ label: "Effects", slug: "docs/effects" }`), `.claude-plugin/plugin.json` description (append "DSP effects")

- [ ] **Step 1: Write `docs/effects.md`** with frontmatter `title: Effects`, sections:
  1. Install and the one-paragraph contract (input/output/wet/latency/defineGraph).
  2. Table of effects: name, constructor options with defaults, params, cells, latency.
  3. `PitchShift` engine guide: granular (≤ 20 ms window for pads, warbly) vs stretch (quality, ~40–120 ms, WASM, `ready`).
  4. `Compressor`/`Limiter`: the gain computer, why a worklet, `reduction` meter, `lookahead` fixed at construction.
  5. `Channel` + `SendBus`: an FX-rack example — five inserts in series, two sends, master `Limiter`, all inside one `defineGraph` in an `AudioProcessor`.
  6. Offline export example with `renderOffline`, awaiting `ready` on worklet effects.
  7. "Coming from Tone.js" table copied from the spec appendix.
     Every code sample must compile against the exports of Tasks 1–16 (names, options, param keys).

- [ ] **Step 2: Skill reference** — `skills/audiorective/references/effects.md` is a copy of `docs/effects.md` minus frontmatter. `SKILL.md`: add row `| \`@audiorective/effects\` | DSP effects — Filter, Distortion, Phaser, FrequencyShifter, PingPongDelay, Convolver, Compressor, Limiter, PitchShift; Channel strip + SendBus. | \`references/effects.md\` |`and a "What to read next" row`| Adding effects / building an FX rack / replacing Tone.js effects | \`references/effects.md\` |`.

- [ ] **Step 3: CHANGELOG** Unreleased → Added: one bullet per public class plus `registerWorklet` and the dB helpers, each prefixed `**effects:**`. README packages table: `| [\`@audiorective/effects\`](./packages/effects) | DSP effects and channel/send plumbing — the Tone.js replacement set |`.

- [ ] **Step 4: Verify** `pnpm --filter @audiorective/web build` renders `/docs/effects/` (Starlight picks up `docs/effects.md` through the existing glob) and the sidebar shows Effects.

- [ ] **Step 5: Commit** — `docs: @audiorective/effects guide, skill reference, changelog`

---

### Task 19: FX Rack demo — headless `FxRack` processor

**Files:**

- Create: `apps/web/src/demos/fx-rack/audio/impulseResponse.ts`, `apps/web/src/demos/fx-rack/audio/FxRack.ts`
- Modify: `apps/web/package.json` (add `"@audiorective/effects": "workspace:*"`)
- Test: `apps/web/tests/fx-rack/fxRack.test.ts`

**Interfaces:**

- Consumes: everything from `@audiorective/effects`; `BufferPlayer`, `Sampler`, `loadAudioBuffer` from core; `createDrumKit` from `../../sequencer/audio/drumKit`.
- Produces:

```ts
export function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2, decay = 4): AudioBuffer; // stereo decaying noise
export type InsertKey = "pitchShift" | "filter" | "frequencyShifter" | "distortion" | "phaser";
export type SendKey = "delay" | "reverb";
export interface FxRackOptions {
  loop?: AudioBuffer | null;
  kit: DrumKit;
  pitchEngine?: PitchShiftEngine;
}
export class FxRack extends AudioProcessor<{}, { isReady: Cell<boolean> }> {
  readonly channel: Channel;
  readonly bus: SendBus;
  readonly inserts: { pitchShift: PitchShift; filter: Filter; frequencyShifter: FrequencyShifter; distortion: Distortion; phaser: Phaser };
  readonly sends: { delay: { effect: PingPongDelay; send: Send }; reverb: { effect: Convolver; send: Send } };
  readonly compressor: Compressor;
  readonly limiter: Limiter;
  readonly deck: BufferPlayer;
  readonly pads: Record<DrumVoiceId, Sampler>;
  readonly graph: GraphHandle;
  readonly ready: Promise<void>;
  get output(): GainNode;
  play(when?: number): void;
  stop(): void;
  hit(pad: DrumVoiceId, when?: number): void;
  scheduleBars(bars: number, bpm: number, from?: number): void; // pattern for offline export: kick 1/3, snare 2/4, hats 8ths
}
```

Graph, all in one `this.defineGraph`, compensated: `deck → channel`, each pad `→ channel`, `channel → pitchShift → filter → frequencyShifter → distortion → phaser → compressor → limiter → output`; sends: `bus.receive("delay") → delay → compressor.input`, `bus.receive("reverb") → reverb → compressor.input`. `isReady` becomes true when `Promise.all([pitchShift.ready, compressor.ready, limiter.ready, reverb.ready])` resolves. Default insert `wet` values: pitchShift 1 with pitch 0, filter 1 (lowpass 15 kHz, so audibly neutral), others 0; sends at gain 0.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderOffline } from "@audiorective/core";
import { FxRack, makeImpulseResponse } from "../../src/demos/fx-rack/audio/FxRack";
import { createDrumKit } from "../../src/demos/sequencer/audio/drumKit";

const peak = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m;
};
const db = (x: number) => 20 * Math.log10(x);

async function renderRack(configure: (rack: FxRack) => void) {
  return renderOffline({ seconds: 2 }, async (ctx) => {
    const rack = new FxRack(ctx, { kit: createDrumKit(ctx), loop: null });
    rack.output.connect(ctx.destination);
    await rack.ready;
    configure(rack);
    rack.scheduleBars(1, 120, 0);
  });
}

describe("FxRack", () => {
  it("renders one bar of pads, non-silent and under the limiter ceiling", async () => {
    const buf = await renderRack((rack) => {
      rack.limiter.params.threshold.value = -3;
    });
    expect(peak(buf)).toBeGreaterThan(0.05);
    expect(db(peak(buf))).toBeLessThanOrEqual(-3 + 0.1);
  });
  it("wet = 0 on every insert reproduces the plain pad sum (aligned by PDC)", async () => {
    const dry = await renderRack((rack) => {
      for (const fx of Object.values(rack.inserts)) fx.params.wet.value = 0;
      rack.compressor.params.wet.value = 0;
      rack.limiter.params.wet.value = 0;
    });
    const ref = await renderOffline({ seconds: 2 }, (ctx) => {
      const kit = createDrumKit(ctx);
      const rack = new FxRack(ctx, { kit, loop: null }); // only for its schedule; route pads straight out
      for (const pad of Object.values(rack.pads)) pad.output.connect(ctx.destination);
      rack.scheduleBars(1, 120, 0);
    });
    const a = dry.getChannelData(0),
      b = ref.getChannelData(0);
    // the rack's graph has latency L (pitch window + lookahead); compare after shifting by it
    let best = Infinity,
      bestShift = 0;
    for (let shift = 0; shift < 12000; shift += 1) {
      let e = 0;
      for (let i = 0; i < 20000; i += 7) e += Math.abs((a[i + shift] ?? 0) - b[i]!);
      if (e < best) {
        best = e;
        bestShift = shift;
      }
    }
    expect(best / (20000 / 7)).toBeLessThan(1e-3);
    expect(bestShift).toBeGreaterThan(0);
  });
  it("makeImpulseResponse decays", () => {
    const ctx = new OfflineAudioContext(2, 128, 44100);
    const ir = makeImpulseResponse(ctx, 1, 4);
    const d = ir.getChannelData(0);
    expect(Math.abs(d[100]!)).toBeGreaterThan(Math.abs(d[d.length - 100]!) * 10);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @audiorective/web test -- --run tests/fx-rack`, expect FAIL.

- [ ] **Step 3: Implement**

`audio/impulseResponse.ts`:

```ts
/** Exponentially decaying stereo noise — a synthetic room, no binary asset. */
export function makeImpulseResponse(ctx: BaseAudioContext, seconds = 2, decay = 4): AudioBuffer {
  const length = Math.ceil(seconds * ctx.sampleRate);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 12345;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * Math.exp((-decay * i) / length);
    }
  }
  return ir;
}
```

`audio/FxRack.ts`:

```ts
import { AudioProcessor, BufferPlayer, Sampler, type Cell, type GraphHandle } from "@audiorective/core";
import {
  Channel,
  Compressor,
  Convolver,
  Distortion,
  Filter,
  FrequencyShifter,
  Limiter,
  Phaser,
  PingPongDelay,
  PitchShift,
  SendBus,
  type PitchShiftEngine,
  type Send,
} from "@audiorective/effects";
import type { DrumKit, DrumVoiceId } from "../../sequencer/audio/drumKit";
import { makeImpulseResponse } from "./impulseResponse";
export { makeImpulseResponse };

export type InsertKey = "pitchShift" | "filter" | "frequencyShifter" | "distortion" | "phaser";
export type SendKey = "delay" | "reverb";
export interface FxRackOptions {
  loop?: AudioBuffer | null;
  kit: DrumKit;
  pitchEngine?: PitchShiftEngine;
}

export class FxRack extends AudioProcessor<{}, { isReady: Cell<boolean> }> {
  readonly channel: Channel;
  readonly bus: SendBus;
  readonly inserts: { pitchShift: PitchShift; filter: Filter; frequencyShifter: FrequencyShifter; distortion: Distortion; phaser: Phaser };
  readonly sends: { delay: { effect: PingPongDelay; send: Send }; reverb: { effect: Convolver; send: Send } };
  readonly compressor: Compressor;
  readonly limiter: Limiter;
  readonly deck: BufferPlayer;
  readonly pads: Record<DrumVoiceId, Sampler>;
  readonly graph: GraphHandle;
  readonly ready: Promise<void>;
  private readonly out: GainNode;

  constructor(ctx: BaseAudioContext, opts: FxRackOptions) {
    const out = new GainNode(ctx);
    super(ctx, ({ cell }) => ({ params: {}, cells: { isReady: cell(false) } }));
    this.out = out;

    this.channel = new Channel(ctx);
    this.bus = new SendBus(ctx);
    this.bus.define("delay");
    this.bus.define("reverb");
    this.inserts = {
      pitchShift: new PitchShift(ctx, { engine: opts.pitchEngine ?? "granular", windowSize: 0.03, stretch: { blockMs: 40 } }),
      filter: new Filter(ctx, { frequency: 15000, type: "lowpass", rolloff: -24 }),
      frequencyShifter: new FrequencyShifter(ctx, { wet: 0 }),
      distortion: new Distortion(ctx, { distortion: 0.5, wet: 0 }),
      phaser: new Phaser(ctx, { frequency: 0.5, baseFrequency: 100, octaves: 3, wet: 0 }),
    };
    const delay = new PingPongDelay(ctx, { delayTime: 0.375, feedback: 0.35 });
    const reverb = new Convolver(ctx, { buffer: makeImpulseResponse(ctx) });
    this.sends = {
      delay: { effect: delay, send: this.channel.send(this.bus, "delay", 0) },
      reverb: { effect: reverb, send: this.channel.send(this.bus, "reverb", 0) },
    };
    this.compressor = new Compressor(ctx, { threshold: -18, ratio: 3, wet: 1 });
    this.limiter = new Limiter(ctx, { threshold: -1 });
    this.deck = new BufferPlayer(ctx, { loop: true, buffer: opts.loop ?? undefined });
    this.pads = {
      kick: new Sampler(ctx, { buffer: opts.kit.kick }),
      snare: new Sampler(ctx, { buffer: opts.kit.snare }),
      hat: new Sampler(ctx, { buffer: opts.kit.hat }),
      clap: new Sampler(ctx, { buffer: opts.kit.clap }),
    };

    const { pitchShift, filter, frequencyShifter, distortion, phaser } = this.inserts;
    this.graph = this.defineGraph(
      () => [
        [this.deck, this.channel],
        [this.pads.kick, this.channel],
        [this.pads.snare, this.channel],
        [this.pads.hat, this.channel],
        [this.pads.clap, this.channel],
        [this.channel, pitchShift],
        [pitchShift, filter],
        [filter, frequencyShifter],
        [frequencyShifter, distortion],
        [distortion, phaser],
        [phaser, this.compressor],
        [this.bus.receive("delay"), delay],
        [delay, this.compressor],
        [this.bus.receive("reverb"), reverb],
        [reverb, this.compressor],
        [this.compressor, this.limiter],
        [this.limiter, out],
      ],
      { compensate: true },
    );

    this.ready = Promise.all([pitchShift.ready, this.compressor.ready, this.limiter.ready, reverb.ready]).then(() => {
      this.cells.isReady.value = true;
    });
  }

  get output(): GainNode {
    return this.out;
  }

  play(when = this.context.currentTime): void {
    this.deck.start(when);
  }
  stop(): void {
    this.deck.stop();
  }
  hit(pad: DrumVoiceId, when?: number): void {
    this.pads[pad].trigger({ when });
  }

  /** Kick on 1 and 3, snare on 2 and 4, hats on every 8th — the export pattern. */
  scheduleBars(bars: number, bpm: number, from = 0): void {
    const beat = 60 / bpm;
    for (let bar = 0; bar < bars; bar++) {
      const t0 = from + bar * 4 * beat;
      this.hit("kick", t0);
      this.hit("kick", t0 + 2 * beat);
      this.hit("snare", t0 + beat);
      this.hit("snare", t0 + 3 * beat);
      for (let e = 0; e < 8; e++) this.hit("hat", t0 + (e * beat) / 2);
    }
  }

  override destroy(): void {
    this.deck.destroy();
    for (const p of Object.values(this.pads)) p.destroy();
    for (const fx of Object.values(this.inserts)) fx.destroy();
    this.sends.delay.effect.destroy();
    this.sends.reverb.effect.destroy();
    this.compressor.destroy();
    this.limiter.destroy();
    this.channel.destroy();
    this.bus.destroy();
    super.destroy();
  }
}
```

`BufferPlayer` with `buffer: undefined` must be constructed as `new BufferPlayer(ctx, { loop: true })` and assigned `deck.buffer = opts.loop` when non-null — adjust if the options type rejects `undefined`.

- [ ] **Step 4: Run, expect PASS.** The dry-equivalence test's residual comes from the granular arm at `wet = 0` being fully silenced (`wetGain = 0`) and the dry arm being delayed by PDC — hence the shift search. If the residual is dominated by the Filter's 15 kHz lowpass on the hats, set `rack.inserts.filter.params.wet.value = 0` (it is in the loop already) — confirm the loop covers all five.

- [ ] **Step 5: Commit** — `feat(web): FxRack headless demo processor`

---

### Task 20: FX Rack demo — engine, island, route, manifest, WAV export

**Files:**

- Create: `apps/web/src/demos/fx-rack/audio/engine.ts`, `apps/web/src/demos/fx-rack/audio/wavEncode.ts`, `apps/web/src/demos/fx-rack/audio/exportBars.ts`, `apps/web/src/demos/fx-rack/FxRackApp.tsx`, `apps/web/src/pages/showroom/fx-rack.astro`, `apps/web/public/showroom/fx-rack.jpg` (placeholder: copy `latency-lab.jpg` until a real capture is taken)
- Modify: `apps/web/src/data/demos.ts`
- Test: `apps/web/tests/fx-rack/wavEncode.test.ts`

**Interfaces:**

- Produces: `engine` (with `rack: FxRack`, `loopLoaded: Promise<void>`), `EngineProvider`, `useEngine`; `encodeWav(buffer: AudioBuffer): Blob` (16-bit PCM, interleaved); `exportBars(bars: number, bpm: number, settings: RackSettings): Promise<Blob>`; `readSettings(rack: FxRack): RackSettings`, `applySettings(rack: FxRack, s: RackSettings): void` where `RackSettings` is `{ engine: PitchShiftEngine; pitch: number; inserts: Record<InsertKey, { wet: number; value: number }>; sends: Record<SendKey, number>; compressor: { threshold: number; ratio: number }; limiter: { threshold: number } }`.

- [ ] **Step 1: Write the failing test** `tests/fx-rack/wavEncode.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { encodeWav } from "../../src/demos/fx-rack/audio/wavEncode";

describe("encodeWav", () => {
  it("writes a 44-byte header plus 16-bit interleaved samples", async () => {
    const ctx = new OfflineAudioContext(2, 4, 48000);
    const buf = ctx.createBuffer(2, 4, 48000);
    buf.getChannelData(0).set([0, 0.5, -0.5, 1]);
    buf.getChannelData(1).set([1, -1, 0, 0]);
    const bytes = new Uint8Array(await encodeWav(buf).arrayBuffer());
    expect(bytes.length).toBe(44 + 4 * 2 * 2);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("RIFF");
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767); // R sample 0 = 1.0
    expect(view.getInt16(48, true)).toBe(16383); // L sample 1 = 0.5
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`audio/wavEncode.ts`:

```ts
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels,
    frames = buffer.length;
  const bytes = new ArrayBuffer(44 + frames * channels * 2);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + frames * channels * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true);
  v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true);
      o += 2;
    }
  return new Blob([bytes], { type: "audio/wav" });
}
```

`audio/exportBars.ts`:

```ts
import { renderOffline } from "@audiorective/core";
import type { PitchShiftEngine } from "@audiorective/effects";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { FxRack, type InsertKey, type SendKey } from "./FxRack";
import { encodeWav } from "./wavEncode";

export interface RackSettings {
  engine: PitchShiftEngine;
  pitch: number;
  inserts: Record<InsertKey, { wet: number; value: number }>;
  sends: Record<SendKey, number>;
  compressor: { threshold: number; ratio: number };
  limiter: { threshold: number };
}

const insertValue = {
  pitchShift: (r: FxRack) => r.inserts.pitchShift.params.pitch,
  filter: (r: FxRack) => r.inserts.filter.params.frequency,
  frequencyShifter: (r: FxRack) => r.inserts.frequencyShifter.params.frequency,
  distortion: (r: FxRack) => r.inserts.distortion.params.distortion,
  phaser: (r: FxRack) => r.inserts.phaser.params.octaves,
} as const;

export function readSettings(rack: FxRack): RackSettings {
  const inserts = Object.fromEntries(
    (Object.keys(insertValue) as InsertKey[]).map((k) => [k, { wet: rack.inserts[k].params.wet.value, value: insertValue[k](rack).value }]),
  ) as RackSettings["inserts"];
  return {
    engine: rack.inserts.pitchShift.engine,
    pitch: rack.inserts.pitchShift.params.pitch.value,
    inserts,
    sends: { delay: rack.sends.delay.send.gain.value, reverb: rack.sends.reverb.send.gain.value },
    compressor: { threshold: rack.compressor.params.threshold.value, ratio: rack.compressor.params.ratio.value },
    limiter: { threshold: rack.limiter.params.threshold.value },
  };
}

export function applySettings(rack: FxRack, s: RackSettings): void {
  for (const k of Object.keys(insertValue) as InsertKey[]) {
    rack.inserts[k].params.wet.value = s.inserts[k].wet;
    insertValue[k](rack).value = s.inserts[k].value;
  }
  rack.sends.delay.send.gain.value = s.sends.delay;
  rack.sends.reverb.send.gain.value = s.sends.reverb;
  rack.compressor.params.threshold.value = s.compressor.threshold;
  rack.compressor.params.ratio.value = s.compressor.ratio;
  rack.limiter.params.threshold.value = s.limiter.threshold;
}

/** Renders `bars` of the pad pattern through a fresh FxRack with the live rack's settings. */
export async function exportBars(bars: number, bpm: number, settings: RackSettings, loop: AudioBuffer | null): Promise<Blob> {
  const seconds = (bars * 4 * 60) / bpm + 1;
  const buffer = await renderOffline({ seconds }, async (ctx) => {
    const rack = new FxRack(ctx, { kit: createDrumKit(ctx), loop, pitchEngine: settings.engine });
    rack.output.connect(ctx.destination);
    await rack.ready;
    applySettings(rack, settings);
    if (loop) rack.play(0);
    rack.scheduleBars(bars, bpm, 0);
  });
  return encodeWav(buffer);
}
```

`audio/engine.ts` (mirrors the sequencer demo; loads `/stems/drums.mp3` after construction). The rack is a `Cell` because the pitch engine is a constructor option: switching engines rebuilds the rack with the same settings.

```ts
import { cell, createEngine, loadAudioBuffer } from "@audiorective/core";
import type { PitchShiftEngine } from "@audiorective/effects";
import { createEngineContext } from "@audiorective/react";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { FxRack } from "./FxRack";
import { applySettings, readSettings } from "./exportBars";

export const engine = createEngine((ctx) => {
  const kit = createDrumKit(ctx);
  const build = (pitchEngine: PitchShiftEngine, loop: AudioBuffer | null) => {
    const r = new FxRack(ctx, { kit, loop, pitchEngine });
    r.output.connect(ctx.destination);
    return r;
  };
  const rack = cell(build("granular", null));
  const loopLoaded = loadAudioBuffer(ctx, "/stems/drums.mp3").then((buf) => {
    rack.value.deck.buffer = buf;
  });

  /** Rebuilds the rack on the other pitch engine, carrying every setting across. */
  const setEngine = async (pitchEngine: PitchShiftEngine): Promise<void> => {
    const old = rack.value;
    if (old.inserts.pitchShift.engine === pitchEngine) return;
    const settings = readSettings(old);
    const wasPlaying = old.deck.cells.isPlaying.value;
    old.stop();
    const next = build(pitchEngine, old.deck.buffer);
    await next.ready;
    applySettings(next, { ...settings, engine: pitchEngine });
    old.destroy();
    rack.value = next;
    if (wasPlaying) next.play();
  };

  return { rack, loopLoaded, setEngine };
});
export const { EngineProvider, useEngine } = createEngineContext(engine);
```

`createEngine` only auto-registers `AudioProcessor` values that sit directly on the returned object, so a rack inside a `Cell` is not engine-registered. The demo does not need `engine.core.latency`: its readout queries `rack.graph.snapshot()` and `rack.graph.arrivalOf(...)` directly, so nothing else is required.

`FxRackApp.tsx`: `export default function FxRackApp() { return <App />; }` importing `./ui/App` (Task 21).

`pages/showroom/fx-rack.astro`: copy `sequencer.astro`, title "FX Rack", component `FxRackApp`.

`data/demos.ts`: append

```ts
{
  slug: "fx-rack",
  title: "FX Rack",
  blurb: "Five inserts, two sends, a compressor and a limiter on one drum loop: every effect an AudioProcessor with a wet fader, PDC-aligned, and exportable offline.",
  thumb: "/showroom/fx-rack.jpg",
  route: "/showroom/fx-rack",
  source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/fx-rack",
  packages: ["@audiorective/effects", "@audiorective/core", "@audiorective/react"],
},
```

- [ ] **Step 4: Run** the wav test, expect PASS; `pnpm --filter @audiorective/web typecheck` passes once Task 21's `ui/App.tsx` exists (create a stub `export function App() { return null; }` now so this task type-checks alone).

- [ ] **Step 5: Commit** — `feat(web): FX Rack engine, export, route and manifest`

---

### Task 21: FX Rack demo — React UI

**Files:**

- Create: `apps/web/src/demos/fx-rack/ui/App.tsx` (replace stub), `ui/Module.tsx`, `ui/Knob.tsx`, `ui/Meter.tsx`, `ui/Transport.tsx`, `ui/GraphReadout.tsx`, `ui/styles.css`
- Modify: none

Apply the `frontend-design` skill for the visual pass. Constraints from the spec: dark rack of modules, neon accents, monospace readouts, consistent with `sequencer/ui/styles.css` variables.

Components (all read via `useValue`, write params directly, call rack methods; no audio logic in React):

- `Transport`: Play/Stop deck (`rack.play()` / `rack.stop()`, state from `useValue(rack.deck.cells.isPlaying)`), four pad buttons (`rack.hit(id)`), "Export 4 bars" button → `exportBars(4, 120, readSettings(rack), rack.deck.buffer)` → `URL.createObjectURL` → programmatic `<a download="fx-rack.wav">` click; shows a spinner while rendering. A hint "Press Play to enable audio" while `engine.core.state() !== "running"`, copied from the sequencer's `Hint`.
- `Module`: card with title, a `wet` fader (`<input type="range" min=0 max=1 step=0.01>` bound to `params.wet`), one main `Knob` (range input) for the effect's control, and a latency readout `useValue(fx.latency)` in samples and ms. For `pitchShift`, an engine toggle calling `engine.setEngine("stretch" | "granular")` (Task 20), disabled while the swap is pending. Every component reads the live rack with `const rack = useValue(engine.rack)`.
- `Meter`: vertical bar of `useValue(fx.cells.reduction)` (0 to −30 dB) for compressor and limiter, with the threshold `Knob`.
- `GraphReadout`: table from `rack.graph.snapshot()` — node label, latency, arrival, and per-edge `compensationSamples`; re-read on an `effect` over `engine.core.latency` (any re-solve changes it) plus a 500 ms interval fallback. Also shows `engine.core.getPathLatency(rack.inserts.pitchShift)`.
- `App`: `EngineProvider` → header (title, subtitle `@audiorective/effects`), `Transport`, a rack grid of five insert `Module`s, two send `Module`s (the fader controls `send.gain`, the knob `delayTime` / none for reverb), `Meter`s, `GraphReadout`, footer copy explaining the wet-fader bypass contract.

- [ ] **Step 1: Build the UI** per the component list, then `pnpm --filter @audiorective/web dev` and open `/showroom/fx-rack`.

- [ ] **Step 2: Verify by hand**: Play starts the loop; every wet fader audibly blends; switching the pitch engine changes the pitch module's latency readout and the `GraphReadout` compensation numbers while the delay/reverb returns stay in time; the export downloads a WAV that plays in a media player and matches the live settings.

- [ ] **Step 3: Browser verification** per the repo convention: take a screenshot via the chrome-devtools MCP of `/showroom/fx-rack` after pressing Play; save it as `apps/web/public/showroom/fx-rack.jpg` (replacing the placeholder).

- [ ] **Step 4: Commit** — `feat(web): FX Rack showroom UI`

---

### Task 22: FX Rack README and site wiring check

**Files:**

- Create: `apps/web/src/demos/fx-rack/README.md`
- Modify: `README.md` (Examples section: add the FX Rack paragraph in the same voice as the other three)

- [ ] **Step 1: Write the README** following `demos/sequencer/README.md`: what it demonstrates (the five spec points: wet-fader bypass, engine toggle + latency/PDC, reduction meters, offline export with the same class, graph readout), structure table, how to run, tests command `pnpm --filter @audiorective/web test -- --run tests/fx-rack`, a "deliberately out of scope" note (no tempo sync on the delay; no modelled compressors), link to the spec.

- [ ] **Step 2: Run everything**: `pnpm build && pnpm test` at the repo root; `pnpm --filter @audiorective/web build` and confirm `/showroom/` lists five cards and `/showroom/fx-rack/` is emitted.

- [ ] **Step 3: Commit** — `docs(web): FX Rack demo README`

---

## Self-review notes

- **Spec coverage:** Part 1 → Tasks 1–3; Part 2 → Tasks 5–12 (Filter, Distortion, Phaser, FrequencyShifter, PingPongDelay, Convolver, granular PitchShift); Part 3 → Tasks 13, 14, 16; Part 4 → Task 4; Part 5 → Task 15; Part 6 → Task 18; Part 7 → each task's tests plus Task 17; Part 8 → Tasks 19–22.
- **Deviations from the spec, deliberate:** the `Lfo` helper gained `connectNode` (Task 12) and the demo's engine exposes `rack` as a `Cell` so the pitch engine can be swapped live (Task 21); both are implementation details, not contract changes. The spec's Filter/Phaser/etc. `gain` and `Q` "bound to every stage" is realised through `fanout` (a `ConstantSourceNode` per param), which is also how `SchedulableParam` binds once.
- **Type consistency checked:** `Effect` constructor `(ctx, arm, build, opts)` used identically in Tasks 6–14, 16; `Send` (`gain`, `dispose`) in Tasks 4 and 19–20; `DynamicsCore` param keys match the worklet's `parameterDescriptors` names; `PitchShift.ready` / `cells.isReady` used by Tasks 16, 19.
- **Open risk:** Task 17 may need the small `ready` hook in `@audiorective/devtools`; the task says how.
