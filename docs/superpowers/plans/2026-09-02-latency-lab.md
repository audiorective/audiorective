# Latency Lab Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/showroom/latency-lab` — a demo where a drum kit is split into a latent lookahead-limiter path and a dry path, with a live graph diagram fed by a new `GraphHandle.snapshot()` API, a PDC on/off toggle that audibly and visibly aligns the paths, and flashes timed on `perceivedTime`.

**Architecture:** Core gains a read-only `snapshot()` on `GraphHandle` (built from the solver's existing state) and documents `onSolve`. The demo's audio core is headless: `Beat` (three samplers on a clock grid), `Click` (metronome tick), `LookaheadLimiter` (an `AudioProcessor` wrapping a public-dir worklet, latency as a Param), and `buildGraph(compensate)` creating the engine-root graph. React observes: an SVG diagram rendered from snapshots, controls, and a flash row.

**Tech Stack:** TypeScript, `@audiorective/core` + `clock` + `react` + `devtools`, Astro 7 / React 19 in `apps/web`, vitest browser mode (already configured in `apps/web/vitest.config.ts`).

**Spec:** `docs/superpowers/specs/2026-09-02-latency-lab-demo-design.md`

## Global Constraints

- Branch `feat/graph-pdc-devtools`; commit directly; the controller pushes.
- Verified facts (do not re-investigate): `apps/web` has `"test": "vitest"` and a browser-mode `vitest.config.ts` (headless Chromium, `fileParallelism: false`) but no demo tests yet; CI runs `pnpm -r run build/typecheck/test -- --run` (so `apps/web` tests and the Astro build both gate the PR); showroom cards come from the `demos` array in `apps/web/src/data/demos.ts` (`Demo { slug, title, blurb, thumb, route, source, packages }`); demo pages are `apps/web/src/pages/showroom/<slug>.astro` mounting `<XApp client:only="react" />` inside `BaseLayout`; the sequencer's `createDrumKit(ctx: BaseAudioContext)` in `apps/web/src/demos/sequencer/audio/drumKit.ts` synthesizes `kick/snare/hat/clap` AudioBuffers — reuse it by import; `Sampler(ctx, { buffer, polyphony })` + `sampler.trigger({ when })`; `Timeline({ audioContext, bpm }).addRuler("pattern", new CycleBarRuler({ numerator: 4, denominator: 4, bars: 1 }))`, `new Clock({ timeline, onTick })`, `window.rulers.pattern.grid(16)` yields `{ time, step }`; `createEngine((ctx, { defineGraph }) => …)`; `engine.core.latency / perceivedTime / getPathLatency`; `GraphOptions.onSolve(handle)`.
- Worklet loading: the worklet is a plain ES module at `apps/web/public/worklets/lookahead-limiter.js`, loaded with `await ctx.audioWorklet.addModule("/worklets/lookahead-limiter.js")`. No Vite `?worker`/`?url` imports. Tests load the same public path (the vitest browser server serves `public/`).
- Latency unit samples everywhere; the limiter's `latency` Param IS its ring-buffer length; the worklet reads the same number via `port.postMessage({ lookahead })`.
- Tests: headless audio tests + pure-function tests only; no component render tests. Run with `pnpm --filter @audiorective/web test -- --run <file>`; typecheck `pnpm --filter @audiorective/web typecheck`; build `pnpm --filter @audiorective/web build` (must stay green — Vercel builds it).
- `@audiorective/devtools` becomes a devDependency of `apps/web` (`workspace:^`); core must be rebuilt (`pnpm --filter @audiorective/core build`) before `apps/web` tests see core changes.
- Comments describe the present, no essays; prettier runs in the pre-commit hook (confirm commits with `git log`).

---

### Task 1: core — `GraphHandle.snapshot()` + public `onSolve`

**Files:**

- Modify: `packages/core/src/graph.ts`
- Modify: `packages/core/src/index.ts` (export `GraphSnapshot` type)
- Modify: `docs/core.md` (snapshot + onSolve paragraph), `CHANGELOG.md`
- Test: `packages/core/tests/graph-snapshot.browser.test.ts` (new)

**Interfaces:**

- Produces:

```ts
export interface GraphSnapshot {
  solveId: number;
  nodes: { id: number; kind: "native" | "processor"; label: string; latency: number; arrival: number }[];
  edges: { from: number; to: number; label?: string; kind: "audio" | "param" | "virtual" | "back"; compensationSamples: number }[];
}
// GraphHandle gains:  snapshot(): GraphSnapshot
//                     idOf(endpoint: GraphSource | AudioParam): number   // the id snapshot() uses for that endpoint (consumers map ids to roles)
```

- [ ] **Step 1: Failing tests**

```ts
// packages/core/tests/graph-snapshot.browser.test.ts
import { describe, expect, it } from "vitest";
import { AudioProcessor, defineGraph } from "../src";

class FakeLatent extends AudioProcessor {
  readonly delay: DelayNode;
  constructor(ctx: BaseAudioContext, samples: number) {
    const delay = new DelayNode(ctx, { delayTime: samples / ctx.sampleRate, maxDelayTime: 1 });
    super(ctx, () => ({ latency: samples }));
    this.delay = delay;
  }
  override get input() {
    return this.delay;
  }
  get output() {
    return this.delay;
  }
}

describe("GraphHandle.snapshot", () => {
  it("reports nodes, edges and the compensating delay of a two-branch join", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const slow = new FakeLatent(ctx, 500);
    const join = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow, { label: "wet" }],
        [slow, join],
        [src, join, { label: "dry" }],
        [join, ctx.destination],
      ],
      { context: ctx },
    );
    const snap = handle.snapshot();
    const slowNode = snap.nodes.find((n) => n.kind === "processor")!;
    expect(slowNode.label).toBe("FakeLatent");
    expect(slowNode.latency).toBe(500);
    const dry = snap.edges.find((e) => e.label === "dry")!;
    expect(dry.kind).toBe("audio");
    expect(dry.compensationSamples).toBe(500);
    expect(snap.edges.filter((e) => e.compensationSamples > 0)).toHaveLength(1);
    const joinNode = snap.nodes.find((n) => n.id === dry.to)!;
    expect(joinNode.arrival).toBe(500);
  });

  it("bumps solveId and updates compensation on a latency change", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const slow = new FakeLatent(ctx, 100);
    const join = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow],
        [slow, join],
        [src, join, { label: "dry" }],
        [join, ctx.destination],
      ],
      { context: ctx },
    );
    const before = handle.snapshot();
    slow.latency.value = 250;
    const after = handle.snapshot();
    expect(after.solveId).toBeGreaterThan(before.solveId);
    expect(after.edges.find((e) => e.label === "dry")!.compensationSamples).toBe(250);
  });

  it("compensate:false reports zero compensation everywhere", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const slow = new FakeLatent(ctx, 100);
    const join = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow],
        [slow, join],
        [src, join],
        [join, ctx.destination],
      ],
      { context: ctx, compensate: false },
    );
    expect(handle.snapshot().edges.every((e) => e.compensationSamples === 0)).toBe(true);
  });

  it("reports virtual and back edge kinds in a feedback topology", () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const proc = new FakeLatent(ctx, 50);
    const fb = new DelayNode(ctx, { delayTime: 0.1 });
    const handle = defineGraph(
      () => [
        [src, proc],
        [proc, fb],
        [fb, proc],
        [proc, ctx.destination],
      ],
      { context: ctx },
    );
    const kinds = new Set(handle.snapshot().edges.map((e) => e.kind));
    expect(kinds.has("back")).toBe(true);
    // a processor whose input and output are the same node has no virtual edge; use distinct nodes:
  });

  it("reports a param edge", () => {
    const ctx = new AudioContext();
    const lfo = new OscillatorNode(ctx);
    const carrier = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [lfo, carrier.gain],
        [carrier, ctx.destination],
      ],
      { context: ctx },
    );
    expect(handle.snapshot().edges.some((e) => e.kind === "param")).toBe(true);
  });
});
```

For the virtual-edge assertion, add a second processor class in the test whose `input` (a `GainNode`) differs from its `output` (a second `GainNode` connected internally) and assert `kinds.has("virtual")` for a graph containing it.

- [ ] **Step 2: Run** `pnpm --filter @audiorective/core test -- --run tests/graph-snapshot.browser.test.ts` — FAIL (`snapshot` undefined).

- [ ] **Step 3: Implement** in `graph.ts`:
- Extend `SolveResult` to also return `backEdges: Set<Wire>` and keep `virtualWires` reachable after the solve (store the last solve's result in closure variables alongside `arrival`).
- Keep a `solveId` counter incremented per solve.
- `snapshot()`:
  - Node set = every resolved `AudioNode` appearing as `fromNode`, or as a non-param `to`, in current + virtual wires. `id = idOf(node)` (the existing identity-id helper). `kind` = `"processor"` if the node is a processor's output in the `owners` map (or the input node of a registered processor — reuse the input→processor association kept for virtual edges), else `"native"`. `label` = the processor's or node's `constructor.name`. `latency` = `nodeLatency(node)`. `arrival` = `arrival.get(node) ?? 0`.
  - Edges: for each current wire → `{ from: idOf(fromNode), to: idOf(to as AudioNode | AudioParam-owner-node?) }`. For param sinks, `to` is the id of the AudioParam's owning node is unknowable from the param — so give param sinks their own synthetic node entry `{ kind: "native", label: "AudioParam" }` keyed by the AudioParam object via `idOf(param)`. `kind` = `"param"` for AudioParam sinks, `"back"` if in `backEdges`, else `"audio"`; `compensationSamples = diffs.get(wire) ?? 0` when compensation is on (0 when off); `label` from the wire's edge options (store `label` on `Wire` during resolution).
  - Virtual wires → `{ kind: "virtual", compensationSamples: 0 }`.
- Export `GraphSnapshot` from `index.ts`.
- `docs/core.md`: one paragraph in the Graph helpers section: `onSolve` (called after every solve with the handle) and `snapshot()` (what it contains, that ids are stable per endpoint, that consumers filter kinds). `CHANGELOG.md` Unreleased **core** Added.

- [ ] **Step 4: Run** the file, then full core suite + typecheck — PASS.
- [ ] **Step 5: Commit** `feat(core): GraphHandle.snapshot() and documented onSolve`.

---

### Task 2: demo audio — `Beat` and `Click`

**Files:**

- Create: `apps/web/src/demos/latency-lab/audio/Beat.ts`, `Click.ts`
- Test: `apps/web/src/demos/latency-lab/audio/Beat.test.ts`, `Click.test.ts`
- Modify: `apps/web/package.json` (add `"@audiorective/devtools": "workspace:^"` to devDependencies now, so Task 3's test can use it; run `pnpm install`)

**Interfaces:**

- Produces:

```ts
export class Beat extends AudioProcessor {
  // output-only
  constructor(ctx: BaseAudioContext, opts: { kit: DrumKit; timeline: Timeline<{ pattern: CycleBarRuler }> });
  readonly samplers: Record<"kick" | "snare" | "hat", Sampler>;
  readonly hits: Cell<{ voice: "kick" | "snare" | "hat"; time: number }[]>; // last scheduled hits (bounded ring, ≤64) — the flash row reads this
  schedule(window: TickWindow): void; // called by the owner's clock tick
  get output(): GainNode;
}
export class Click extends AudioProcessor {
  // output-only; enveloped 1 kHz burst per beat
  constructor(ctx: BaseAudioContext);
  readonly enabled: Param<boolean>;
  readonly ticks: Cell<number[]>; // scheduled tick times (bounded)
  schedule(window: TickWindow): void;
  get output(): GainNode;
}
```

The timeline/clock is owned by the graph module (Task 4) so both sources schedule from the same tick; `schedule(window)` iterates `window.rulers.pattern.grid(16)` (Beat: fixed pattern kick `[0,4,8,12]`, snare `[4,12]`, hat `[2,6,10,14]`) / `grid(4)` (Click: one tick per beat, an `OscillatorNode` + gain envelope started/stopped at `time`).

- [ ] **Step 1: Failing tests** — `Beat.test.ts`: build `Beat` with `createDrumKit(ctx)` (import from `../../sequencer/audio/drumKit`) and a `Timeline`; hand it a fake tick window whose `rulers.pattern.grid(16)` yields steps 0–15 at `time = step * 0.125`; assert `hits.value` contains kick at 0/4/8/12, snare at 4/12, hat at 2/6/10/14 with the matching times, and that `sampler.trigger` was invoked (spy) once per hit. `Click.test.ts`: same fake window with `grid(4)`; assert 4 ticks recorded and, with `enabled.value = false`, none. Both files use a real `AudioContext` (browser mode).
- [ ] **Step 2: Run** `pnpm --filter @audiorective/web test -- --run src/demos/latency-lab/audio` — FAIL.
- [ ] **Step 3: Implement** the two classes (locals before `super()`, no params registry beyond `enabled` on `Click`; `hits`/`ticks` are `Cell`s updated via `update()` and capped at 64 entries).
- [ ] **Step 4: Run** tests + `pnpm --filter @audiorective/web typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(web): latency-lab Beat and Click sources`.

---

### Task 3: demo audio — `LookaheadLimiter` worklet + processor + pin test

**Files:**

- Create: `apps/web/public/worklets/lookahead-limiter.js`
- Create: `apps/web/src/demos/latency-lab/audio/LookaheadLimiter.ts`
- Test: `apps/web/src/demos/latency-lab/audio/LookaheadLimiter.test.ts`

**Interfaces:**

- Produces:

```ts
export const LIMITER_WORKLET_URL = "/worklets/lookahead-limiter.js";
export async function loadLimiterWorklet(ctx: BaseAudioContext): Promise<void>; // addModule once per context (WeakSet guard)
export class LookaheadLimiter extends AudioProcessor {
  constructor(ctx: BaseAudioContext, opts?: { lookaheadSeconds?: number; ceiling?: number }); // requires loadLimiterWorklet(ctx) first
  // latency: param({ default: Math.round(lookaheadSeconds * ctx.sampleRate) }) — the slider writes this
  get input(): AudioWorkletNode;
  get output(): AudioWorkletNode;
}
```

- [ ] **Step 1: Worklet** — `lookahead-limiter.js`: `class LookaheadLimiterProcessor extends AudioWorkletProcessor` with a per-channel ring buffer of `maxLookahead = sampleRate` samples; `lookahead` (samples) set via `port.onmessage`; `ceiling` as a static `parameterDescriptors` param (default 0.9). `process()`: for each frame, write input into the ring, read the sample `lookahead` behind, track the running peak over the lookahead window (a simple max over the buffered window recomputed per 128-frame block is acceptable), gain = `min(1, ceiling / peak)`, output the delayed sample × gain. Register with `registerProcessor("lookahead-limiter", …)`.
- [ ] **Step 2: Failing pin test** — `measureLatency`/`assertLatency` take a synchronous `build(ctx)` and create their own `OfflineAudioContext` per rate, but a worklet module must be `await addModule`d on THAT context first. So the test cannot use `assertLatency` directly; it reproduces its mechanism with a pre-loaded context:

```ts
import { describe, expect, it } from "vitest";
import { LookaheadLimiter, loadLimiterWorklet } from "./LookaheadLimiter";

// Worklet processors measure with a pre-loaded context: the module must be added to
// the exact OfflineAudioContext that renders, so the test owns the context.
async function measure(sampleRate: number) {
  const ctx = new OfflineAudioContext(2, sampleRate, sampleRate);
  await loadLimiterWorklet(ctx);
  const proc = new LookaheadLimiter(ctx, { lookaheadSeconds: 0.02 });
  const buffer = new AudioBuffer({ length: 1, sampleRate });
  buffer.getChannelData(0)[0] = 1;
  const src = new AudioBufferSourceNode(ctx, { buffer });
  src.connect(proc.input);
  proc.output.connect(ctx.destination);
  src.start(0);
  const out = (await ctx.startRendering()).getChannelData(0);
  const firstArrival = out.findIndex((v) => Math.abs(v) > 1e-4);
  return { firstArrival, declared: proc.latency.value };
}

describe("LookaheadLimiter latency", () => {
  it("declares the latency it actually has, at both sample rates", async () => {
    for (const rate of [44100, 48000]) {
      const { firstArrival, declared } = await measure(rate);
      expect(declared).toBe(Math.round(0.02 * rate));
      expect(firstArrival).toBe(declared);
    }
  });
});
```

- [ ] **Step 3: Run** — FAIL (module not loaded / class missing).
- [ ] **Step 4: Implement** `LookaheadLimiter.ts`: `loadLimiterWorklet` guarded by a `WeakSet<BaseAudioContext>`; the processor constructs `new AudioWorkletNode(ctx, "lookahead-limiter", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })` as a local before `super()`; build callback `{ latency: param({ default: Math.round(lookahead * ctx.sampleRate), min: 1, max: ctx.sampleRate }) }`; after `super()`, `this.effect(() => node.port.postMessage({ lookahead: this.latency.value }))` so slider writes reach the worklet; `ceiling` bound to the worklet AudioParam via `param({ default: 0.9, bind: node.parameters.get("ceiling")! })`.
- [ ] **Step 5: Run** test + typecheck — PASS. **Commit** `feat(web): latency-lab lookahead limiter worklet with declared latency`.

---

### Task 4: demo audio — root graph, PDC toggle, readings

**Files:**

- Create: `apps/web/src/demos/latency-lab/audio/engine.ts`, `graph.ts`, `flashTime.ts`
- Test: `apps/web/src/demos/latency-lab/audio/graph.test.ts`, `flashTime.test.ts`

**Interfaces:**

- Produces:

```ts
// graph.ts
export interface LabNodes { beat: Beat; click: Click; limiter: LookaheadLimiter; split: GainNode; dry: GainNode; master: GainNode }
export class Lab {                                      // plain class (owns no nodes itself; the engine's graph does the wiring)
  readonly limiterBypassed = new Param<boolean>({ default: false });
  readonly pdcEnabled = new Param<boolean>({ default: true });
  readonly solveTick = new Cell<number>(0);             // bumped in onSolve; the diagram subscribes
  handle: GraphHandle;                                  // current root graph
  constructor(engine: AudioEngine, nodes: LabNodes, defineGraph: EngineSetupHelpers["defineGraph"])
  setPdc(enabled: boolean): void;                       // dispose + rebuild with compensate flag; updates pdcEnabled
  snapshot(): GraphSnapshot;
}
// engine.ts
export const engine = createEngine((ctx, { defineGraph }) => { … returns { beat, click, limiter, master, lab, clock, timeline, ready: Promise<void> } });
export const { EngineProvider, useEngine } = createEngineContext(engine);
// flashTime.ts
export function flashDelayMs(hitTime: number, pathLatencySamples: number, sampleRate: number, outputLatency: number, now: number): number;
//   = max(0, (hitTime + pathLatencySamples / sampleRate + outputLatency − now) * 1000)
```

Edge function in `Lab`:

```ts
() => [
  [beat, split],
  !this.limiterBypassed.value && [split, limiter, { label: "wet" }],
  !this.limiterBypassed.value && [limiter, master],
  this.limiterBypassed.value && [split, master, { label: "bypass" }],
  [split, dry, { label: "dry" }],
  [dry, master],
  [click, master, { label: "click" }],
  [master, ctx.destination],
];
```

Because the limiter worklet loads asynchronously, `engine.ts` constructs everything except the limiter synchronously, exposes `ready`, and `Lab` is created once `LookaheadLimiter` exists (the React app awaits `ready` before rendering controls). The clock: `Timeline({ audioContext: ctx, bpm: 110 }).addRuler("pattern", new CycleBarRuler({ numerator: 4, denominator: 4, bars: 1 }))`, `new Clock({ timeline, onTick: (w) => { beat.schedule(w); click.schedule(w); } })`.

- [ ] **Step 1: Failing tests** — `graph.test.ts` (OfflineAudioContext, `createEngine(setup, { context })`, limiter pre-loaded): (a) with PDC on, trigger one kick at t=0.05 s and assert the rendered output has ONE onset (first arrival) at `0.05 s + limiter.latency` samples and silence before it; (b) with PDC off (`lab.setPdc(false)`), assert two onsets: one at 0.05 s (dry) and one `latency` samples later; (c) bypass on with PDC on: the wet copy is gone and the dry onset stays where PDC put it (no timing shift); (d) `limiter.latency.value = 2 * previous` → `engine.core.latency.value` follows. `flashTime.test.ts`: three arithmetic cases including the clamp at 0.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `Lab`, `engine.ts`, `flashDelayMs`. `setPdc`: `this.handle.dispose(); this.handle = defineGraph(edges, { compensate: enabled, onSolve: () => this.solveTick.update(n => n + 1) })`.
- [ ] **Step 4: Run** tests + typecheck — PASS. **Commit** `feat(web): latency-lab root graph, PDC toggle, readings`.

---

### Task 5: UI — diagram, controls, flash row

**Files:**

- Create: `apps/web/src/demos/latency-lab/ui/App.tsx`, `GraphDiagram.tsx`, `Controls.tsx`, `FlashRow.tsx`, `styles.css`
- Create: `apps/web/src/demos/latency-lab/LatencyLabApp.tsx` (thin wrapper, like `SequencerApp.tsx`)

**Interfaces:** consumes `useEngine()`, `useValue`, `Lab.snapshot()`, `lab.solveTick`, `engine.core.latency/perceivedTime/getPathLatency`, `beat.hits`, `click.ticks`, `flashDelayMs`.

- [ ] **Step 1: `GraphDiagram.tsx`** — `useValue(lab.solveTick)` triggers re-read of `lab.snapshot()`. Static layout `const POS: Record<string, {x:number;y:number}>` keyed by node label (`Beat`, `Click`, `GainNode#split`… — since several nodes are `GainNode`s, key positions by **role**, resolved by matching snapshot node ids to `LabNodes` via a `Map<number, role>` built once from `snapshot()` ids of the known node objects — expose `lab.roleOf(id)` that maps `idOf`-style ids by comparing against the known nodes; simplest: `Lab` keeps `roles: Map<object, string>` and `snapshot()` is wrapped to attach `role` to each node using a parallel `handle.snapshot()` + a `nodeIdOf(node)` helper added to `GraphHandle` in Task 1 — add `idOf(node: GraphSource | AudioParam): number` to the handle interface there). Filter `virtual`/`back`/`param` edges. Render: `<rect>` per node with label + `latency` samples for processors; `<line>`/`<path>` per audio edge with an arrowhead; a `<text>` badge `⏱ N` at the midpoint of any edge with `compensationSamples > 0`; join arrivals as small labels; header text `engine.latency: N samples (M ms) · PDC on/off`.
- [ ] **Step 2: `Controls.tsx`** — Play/Stop (`clock.start()/stop()` via `useValue(clock.state)`), PDC toggle (`lab.setPdc`), with the inline note "re-wires audibly when toggled while playing", Bypass toggle (`lab.limiterBypassed.value = …`), lookahead slider 5–100 ms writing `limiter.latency.value = Math.round(ms/1000 * ctx.sampleRate)`, Click on/off, master volume (`master.gain` via a `SchedulableParam`? — keep a `Param`-less direct `master.gain.value` write; it's a demo control).
- [ ] **Step 3: `FlashRow.tsx`** — four pads; subscribe to `beat.hits` / `click.ticks`; for each new entry schedule `setTimeout(flash, flashDelayMs(time, engine.core.getPathLatency(source), ctx.sampleRate, ctx.outputLatency ?? 0, ctx.currentTime))`; a 60 ms CSS flash. Keep a `Set` of already-scheduled times to avoid double scheduling on re-render.
- [ ] **Step 4: `App.tsx`** — `EngineProvider`, wait on `engine.ready` (render a "loading limiter…" line until then), then Diagram + Controls + FlashRow; mirror the sequencer's `Hint` for "press Play to enable audio".
- [ ] **Step 5: Verify** `pnpm --filter @audiorective/web typecheck && pnpm --filter @audiorective/web build` — PASS (the Astro build catches import/SSR mistakes; `client:only` island keeps audio off the server). **Commit** `feat(web): latency-lab UI — graph diagram, controls, flash row`.

---

### Task 6: page, showroom card, README, docs link

**Files:**

- Create: `apps/web/src/pages/showroom/latency-lab.astro` (copy the sequencer page shape, title "Latency Lab")
- Modify: `apps/web/src/data/demos.ts` (new entry: slug `latency-lab`, title "Latency Lab", blurb "A drum kit split into a lookahead-limited path and a dry path: watch defineGraph rewire live and PDC snap the two into sample alignment.", thumb `/showroom/latency-lab.jpg` — add a placeholder image by copying `apps/web/public/showroom/sequencer.jpg` to `latency-lab.jpg`, route `/showroom/latency-lab`, source URL under `tree/main/apps/web/src/demos/latency-lab`, packages `["@audiorective/core", "@audiorective/clock", "@audiorective/react", "@audiorective/devtools"]`)
- Create: `apps/web/src/demos/latency-lab/README.md` — sequencer README style: run instructions, numbered "What it demonstrates" (1 `defineGraph` over direct refs + conditional bypass edges, 2 PDC alignment with the `⏱` badge, 3 dynamic latency re-solve from a Param, 4 `perceivedTime`/`getPathLatency` A/V sync, 5 wrapping a worklet with declared latency + the `assertLatency` pin test, 6 headless testing of the whole graph offline), a structure table, and the PDC-toggle caveat.
- Modify: `docs/core.md` — one line in the PDC section linking to the demo.

- [ ] **Step 1:** create/modify the files above.
- [ ] **Step 2: Verify** `pnpm --filter @audiorective/web build` — the new page renders in the build output (`dist/showroom/latency-lab/index.html` exists); `pnpm --filter @audiorective/web test -- --run` all green; `pnpm -r typecheck`.
- [ ] **Step 3: Commit** `docs(web): latency-lab page, showroom card, README`.

---

## Execution notes

- Order 1 → 2 → 3 → 4 → 5 → 6. Task 1 is core (rebuild core before web tasks). Tasks 2 and 3 are independent of each other but both precede 4.
- After each task's review clears, the controller pushes so CI (`build-typecheck-test`, Vercel) runs on the slice.
- Deviations from the spec's observable behavior get noted in the commit message and, if API-visible, in the spec file.
