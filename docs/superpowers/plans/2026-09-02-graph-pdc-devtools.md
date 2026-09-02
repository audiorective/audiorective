# Graph Helpers with Latency Compensation + Devtools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reactive `defineGraph` wiring helper with DAW-style latency compensation (PDC) to `@audiorective/core`, plus a `@audiorective/devtools` impulse validator and an `audio-processor-authoring` skill.

**Architecture:** Edges are declared as direct references (`[osc, filter]`) inside an alien-signals effect; each re-evaluation diffs connections and re-solves latency locally at join points, inserting compensating `DelayNode`s. Nested processors compose through a single `latency: Param<number>` on `AudioProcessor` (declared, or derived from the processor's own graph). `AudioEngine` owns a root graph whose sink is `ctx.destination`, giving `latency` / `perceivedTime` / `getPathLatency`. Devtools measures actual latency with a Dirac impulse through an `OfflineAudioContext` and prints the declaration to paste.

**Tech Stack:** TypeScript, alien-signals 3.x, Web Audio, vitest browser mode (headless Chromium via `@vitest/browser-playwright`), tsdown, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-01-graph-helpers-pdc-devtools-design.md`

## Global Constraints

- Work happens on branch `feat/graph-pdc-devtools` (already exists, based on `origin/main`).
- Latency unit is **samples** everywhere; seconds only inside compensating `DelayNode.delayTime`.
- "Latency" = fixed processing delay before earliest output. Musical delay (DelayNode, reverb tail, chorus) is **not** latency; native `AudioNode`s contribute 0.
- Bare `AudioWorkletNode` is never a graph endpoint — compile error and runtime throw.
- Raw `.connect()` outside `defineGraph` is neither tracked nor compensated; `getPathLatency` on an untracked processor throws `LatencyUnknownError`, never returns 0.
- No new runtime dependencies in core. Devtools depends only on `@audiorective/core` (`workspace:^`).
- Public API changes get a `CHANGELOG.md` entry under an Unreleased heading (all packages version together).
- Tests: `pnpm --filter @audiorective/core test -- --run <file>` (browser mode, serialized — `fileParallelism: false` matters for wall-clock tests). Type-check: `pnpm --filter @audiorective/core typecheck`.
- Comments follow the house style: describe the present, respect scope, no essays.
- The pre-commit hook runs prettier over the whole repo; commit output is noisy — check `git log` to confirm.

---

### Task 1: `AudioProcessor.latency` + `BaseAudioContext` widening

**Files:**

- Modify: `packages/core/src/AudioProcessor.ts`
- Modify: `packages/core/src/AudioEngine.ts` (context type only)
- Test: `packages/core/tests/latency.browser.test.ts` (new)

**Interfaces:**

- Consumes: existing `AudioProcessor` build-callback contract (`{ params, cells? }`).
- Produces: `AudioProcessor.latency: Param<number>`; build result accepts `latency?: number | Param<number>`; `AudioProcessor.context: BaseAudioContext`; `AudioProcessor.prototype.declaredLatency: boolean` (readonly — true when the build callback supplied one; Task 4 uses it to decide derive-vs-respect).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/latency.browser.test.ts
import { describe, expect, it } from "vitest";
import { AudioProcessor, Param } from "../src";

class Plain extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    super(ctx, () => ({}));
  }
  get output() {
    return undefined;
  }
}

class Declared extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    super(ctx, () => ({ latency: 512 }));
  }
  get output() {
    return undefined;
  }
}

class DeclaredParam extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    super(ctx, ({ param }) => ({ latency: param({ default: 128 }) }));
  }
  get output() {
    return undefined;
  }
}

describe("AudioProcessor.latency", () => {
  it("defaults to 0 and is a Param", () => {
    const p = new Plain(new AudioContext());
    expect(p.latency).toBeInstanceOf(Param);
    expect(p.latency.value).toBe(0);
    expect(p.declaredLatency).toBe(false);
  });

  it("accepts a number declaration", () => {
    const p = new Declared(new AudioContext());
    expect(p.latency.value).toBe(512);
    expect(p.declaredLatency).toBe(true);
  });

  it("accepts a Param declaration that stays writable", () => {
    const p = new DeclaredParam(new AudioContext());
    expect(p.latency.value).toBe(128);
    p.latency.value = 256;
    expect(p.latency.value).toBe(256);
  });

  it("constructs against an OfflineAudioContext", () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const p = new Plain(ctx);
    expect(p.context).toBe(ctx);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @audiorective/core test -- --run tests/latency.browser.test.ts`
Expected: FAIL — `latency` undefined / TS error on `BaseAudioContext`.

- [ ] **Step 3: Implement**

In `AudioProcessor.ts`:

- `readonly context: BaseAudioContext;` and constructor parameter `context: BaseAudioContext`. The silencer code is unchanged (`GainNode` + `connect(context.destination)` both exist on `BaseAudioContext`).
- Extend `BuildResult` with `latency?: number | Param<number>` (a plain optional field on the intersection — no generics change).
- After `build(helpers)` returns:

```ts
const declared = "latency" in result ? (result as { latency?: number | Param<number> }).latency : undefined;
this.declaredLatency = declared !== undefined;
this.latency = declared instanceof Param ? declared : new Param({ default: declared ?? 0 });
```

- Add fields `readonly latency: Param<number>; readonly declaredLatency: boolean;` and destroy the internally-created latency Param in `destroy()` only when it was not supplied by the caller (a supplied Param is already in the params registry or the caller's ownership).

In `AudioEngine.ts`: no change to `AudioContext` usage (a live engine keeps a real `AudioContext`); only ensure nothing breaks from processors typed against `BaseAudioContext`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @audiorective/core test -- --run tests/latency.browser.test.ts && pnpm --filter @audiorective/core typecheck`
Expected: PASS. Then run the full core suite: `pnpm --filter @audiorective/core test -- --run` — regression must be clean (players, Spatial, Analyser, engine).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests/latency.browser.test.ts
git commit -m "feat(core): AudioProcessor.latency param + BaseAudioContext widening"
```

---

### Task 2: `defineGraph` — reactive edge diffing (no compensation yet)

**Files:**

- Create: `packages/core/src/graph.ts`
- Modify: `packages/core/src/AudioProcessor.ts` (protected `defineGraph` method, disposal in `destroy()`)
- Modify: `packages/core/src/index.ts` (export `defineGraph`, types)
- Test: `packages/core/tests/graph.browser.test.ts` (new)
- Test: `packages/core/tests/graph.types.test-d.ts` (new, type-level; runs under `vitest --typecheck` which the existing config picks up via `typecheck` — if the repo has no typecheck test setup, assert via `// @ts-expect-error` lines compiled by `pnpm typecheck` instead)

**Interfaces:**

- Consumes: Task 1's `AudioProcessor.latency` (not yet read here), `SchedulableParam` internals (needs an accessor for its backing `AudioParam` — add `/** Backing AudioParam, for graph param sinks. */ get audioParam(): AudioParam` to `SchedulableParam` if not present).
- Produces:

```ts
// graph.ts — the surface later tasks build on
export type GraphSource = AudioNode | AudioProcessor; // AudioWorkletNode excluded via NotWorklet<T>
export type GraphSink = AudioNode | AudioProcessor | AudioParam | SchedulableParam;
export interface EdgeOptions {
  output?: number;
  input?: number;
  label?: string;
}
export type GraphEdge = readonly [GraphSource, GraphSink] | readonly [GraphSource, GraphSink, EdgeOptions];
export type EdgeList = ReadonlyArray<GraphEdge | false | null | undefined>;
export interface GraphOptions {
  context: BaseAudioContext;
  compensate?: boolean;
  owner?: AudioProcessor;
}
export interface GraphHandle {
  dispose(): void;
}
export function defineGraph(fn: () => EdgeList, options: GraphOptions): GraphHandle;
```

and `AudioProcessor`: `protected defineGraph(fn: () => EdgeList, opts?: { compensate?: boolean }): GraphHandle` (fills `context` and `owner: this`, tracks the handle for `destroy()`).

- [ ] **Step 1: Write the failing behavior tests**

```ts
// packages/core/tests/graph.browser.test.ts
import { describe, expect, it } from "vitest";
import { AudioProcessor, Param, defineGraph } from "../src";

// Renders `seconds` through an OfflineAudioContext after `wire` runs; returns channel 0.
async function render(seconds: number, wire: (ctx: OfflineAudioContext) => void): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * 44100), 44100);
  wire(ctx);
  const buf = await ctx.startRendering();
  return buf.getChannelData(0);
}

function dirac(ctx: BaseAudioContext): AudioBufferSourceNode {
  const buffer = new AudioBuffer({ length: 1, sampleRate: ctx.sampleRate });
  buffer.getChannelData(0)[0] = 1;
  const src = new AudioBufferSourceNode(ctx, { buffer });
  src.start(0);
  return src;
}

const firstArrival = (data: Float32Array, threshold = 1e-4) => data.findIndex((v) => Math.abs(v) > threshold);

describe("defineGraph wiring", () => {
  it("connects declared edges", async () => {
    const data = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      const gain = new GainNode(ctx);
      defineGraph(
        () => [
          [src, gain],
          [gain, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(0);
  });

  it("rewires reactively on signal change", async () => {
    // gate=false drops the src→destination edge; render twice around a flip.
    const gate = new Param<boolean>({ default: false });
    const silent = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      defineGraph(() => [gate.value && [src, ctx.destination]], { context: ctx });
    });
    expect(firstArrival(silent)).toBe(-1);

    gate.value = true;
    const audible = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      defineGraph(() => [gate.value && [src, ctx.destination]], { context: ctx });
    });
    expect(firstArrival(audible)).toBe(0);
  });

  it("connects through a processor's input/output", async () => {
    class PassThrough extends AudioProcessor {
      private readonly gain: GainNode;
      constructor(ctx: BaseAudioContext) {
        const gain = new GainNode(ctx);
        super(ctx, () => ({}));
        this.gain = gain;
      }
      override get input() {
        return this.gain;
      }
      get output() {
        return this.gain;
      }
    }
    const data = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      const proc = new PassThrough(ctx);
      defineGraph(
        () => [
          [src, proc],
          [proc, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(0);
  });

  it("connects an AudioParam sink", async () => {
    const data = await render(0.01, (ctx) => {
      const mod = dirac(ctx);
      const carrier = new ConstantSourceNode(ctx, { offset: 0 });
      carrier.start(0);
      defineGraph(
        () => [
          [mod, carrier.offset], // impulse into the offset AudioParam
          [carrier, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(0); // param modulation is audible at sample 0
  });

  it("dispose() disconnects everything", async () => {
    const data = await render(0.01, (ctx) => {
      const src = dirac(ctx);
      const handle = defineGraph(() => [[src, ctx.destination]], { context: ctx });
      handle.dispose();
    });
    expect(firstArrival(data)).toBe(-1);
  });

  it("rejects a bare AudioWorkletNode at runtime", () => {
    const ctx = new AudioContext();
    const fake = Object.create(AudioWorkletNode.prototype) as AudioWorkletNode;
    expect(() => defineGraph(() => [[fake, ctx.destination]], { context: ctx })).toThrow(/AudioWorkletNode/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @audiorective/core test -- --run tests/graph.browser.test.ts`
Expected: FAIL — `defineGraph` not exported.

- [ ] **Step 3: Implement `graph.ts` (diffing only)**

Core shape (compensation lands in Task 3; keep the resolve step a no-op hook):

```ts
// packages/core/src/graph.ts
import { effect } from "alien-signals";
import { AudioProcessor } from "./AudioProcessor";
import { SchedulableParam } from "./SchedulableParam";

type Endpoint = AudioNode | AudioParam;

// One physical connection, keyed for diffing by identity + channel indices.
interface Wire {
  fromNode: AudioNode;
  to: Endpoint;
  output: number;
  input: number;
}

const resolveFrom = (v: GraphSource): AudioNode => {
  if (v instanceof AudioProcessor) {
    const out = v.output;
    if (!out) throw new Error(`defineGraph: processor used as source has no output`);
    return out;
  }
  assertNotWorklet(v);
  return v;
};

const resolveTo = (v: GraphSink): Endpoint => {
  if (v instanceof AudioProcessor) {
    const inp = v.input;
    if (!inp) throw new Error(`defineGraph: processor used as sink has no input`);
    return inp;
  }
  if (v instanceof SchedulableParam) return v.audioParam;
  if (v instanceof AudioParam) return v;
  assertNotWorklet(v);
  return v;
};

function assertNotWorklet(node: AudioNode): void {
  if (typeof AudioWorkletNode !== "undefined" && node instanceof AudioWorkletNode) {
    throw new Error("defineGraph: a bare AudioWorkletNode has unknowable latency — wrap it in an AudioProcessor that declares latency");
  }
}

export function defineGraph(fn: () => EdgeList, options: GraphOptions): GraphHandle {
  let current = new Map<string, Wire>(); // key: identity ids + channels
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (o: object) => ids.get(o) ?? (ids.set(o, nextId), nextId++);

  const apply = (edges: EdgeList) => {
    const next = new Map<string, Wire>();
    for (const e of edges) {
      if (!e) continue;
      const [from, to, opts] = e;
      const wire: Wire = { fromNode: resolveFrom(from), to: resolveTo(to), output: opts?.output ?? 0, input: opts?.input ?? 0 };
      next.set(`${idOf(wire.fromNode)}>${idOf(wire.to)}@${wire.output},${wire.input}`, wire);
    }
    for (const [k, w] of current) if (!next.has(k)) disconnectWire(w);
    for (const [k, w] of next) if (!current.has(k)) connectWire(w);
    current = next;
    resolve(edges); // Task 3 fills this in; no-op for now
  };

  const stop = effect(() => apply(fn()));
  return {
    dispose() {
      stop();
      for (const w of current.values()) disconnectWire(w);
      current = new Map();
    },
  };
}

function connectWire(w: Wire) {
  if (w.to instanceof AudioParam) w.fromNode.connect(w.to, w.output);
  else w.fromNode.connect(w.to, w.output, w.input);
}
function disconnectWire(w: Wire) {
  try {
    if (w.to instanceof AudioParam) w.fromNode.disconnect(w.to, w.output);
    else w.fromNode.disconnect(w.to, w.output, w.input);
  } catch {
    // Already gone (node disposed elsewhere); the goal is the absence of the connection.
  }
}
```

Add to `SchedulableParam` (if absent): `get audioParam(): AudioParam { return this._audioParam; }` matching its private field name.

Add to `AudioProcessor`:

```ts
private _graphs: GraphHandle[] = [];

protected defineGraph(fn: () => EdgeList, opts?: { compensate?: boolean }): GraphHandle {
  const handle = defineGraph(fn, { context: this.context, compensate: opts?.compensate, owner: this });
  this._graphs.push(handle);
  return handle;
}
```

and in `destroy()`: dispose `_graphs` before stopping effects.

Type-level exclusion of `AudioWorkletNode`: `export type NotWorklet<T> = T extends { port: MessagePort; parameters: AudioParamMap } ? never : T;` applied in the public edge tuple types; verify with `@ts-expect-error` lines in `graph.types.test-d.ts` (edge into an output-only processor as sink, `AudioWorkletNode` endpoint, `AudioParam` as `from`).

Export from `index.ts`: `defineGraph` and `type { GraphEdge, EdgeList, EdgeOptions, GraphHandle, GraphOptions, GraphSource, GraphSink }`.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @audiorective/core test -- --run tests/graph.browser.test.ts && pnpm --filter @audiorective/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): defineGraph reactive edge diffing over direct references"
```

---

### Task 3: Compensation solver + derived latency

**Files:**

- Modify: `packages/core/src/graph.ts` (the `resolve` hook becomes the solver)
- Test: `packages/core/tests/graph-latency.browser.test.ts` (new)

**Interfaces:**

- Consumes: Task 1's `latency`/`declaredLatency`; Task 2's `Wire` map and `resolve(edges)` hook.
- Produces: automatic `DelayNode` insertion at joins; derived `owner.latency` writes; `GraphHandle.arrivalOf(node: GraphSource): number` (samples at that node's output edge — Task 4's `getPathLatency` consumes it); internal `graphOf: WeakMap<AudioProcessor, GraphRecord>` exported as `_graphRegistry` for Task 4 (single underscore, documented as engine-internal).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/graph-latency.browser.test.ts
import { describe, expect, it } from "vitest";
import { AudioProcessor, defineGraph } from "../src";

// A processor that really delays by N samples AND declares it — the stand-in
// for a buffering effect (a worklet, a lookahead limiter).
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

// render/dirac/firstArrival helpers: same as graph.browser.test.ts — copy them
// into this file (tests stay self-contained; no shared helper module yet).

describe("latency compensation", () => {
  it("aligns a two-branch join to the slower branch", async () => {
    const N = 500;
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const split = new GainNode(ctx);
      const slow = new FakeLatent(ctx, N);
      const fast = new GainNode(ctx); // 0-latency branch
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, split],
          [split, slow],
          [slow, join],
          [split, fast],
          [fast, join],
          [join, ctx.destination],
        ],
        { context: ctx },
      );
    });
    // Both copies of the impulse land on the same sample: one peak, at N.
    expect(firstArrival(data)).toBe(N);
    expect(data.slice(0, N).every((v) => Math.abs(v) < 1e-4)).toBe(true);
  });

  it("compensate:false leaves branches misaligned", async () => {
    const N = 500;
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const split = new GainNode(ctx);
      const slow = new FakeLatent(ctx, N);
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, split],
          [split, slow],
          [slow, join],
          [split, join],
          [join, ctx.destination],
        ],
        { context: ctx, compensate: false },
      );
    });
    expect(firstArrival(data)).toBe(0); // dry branch arrives immediately
  });

  it("derives owner latency: serial sum, parallel max", async () => {
    class Wet extends AudioProcessor {
      constructor(ctx: BaseAudioContext) {
        const inGain = new GainNode(ctx);
        const outGain = new GainNode(ctx);
        super(ctx, () => ({}));
        const a = new FakeLatent(ctx, 100);
        const b = new FakeLatent(ctx, 300);
        this._in = inGain;
        this._out = outGain;
        this.defineGraph(() => [
          [inGain, a],
          [a, outGain], // branch 100
          [inGain, b],
          [b, outGain], // branch 300 → max 300
        ]);
      }
      private _in!: GainNode;
      private _out!: GainNode;
      override get input() {
        return this._in;
      }
      get output() {
        return this._out;
      }
    }
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const wet = new Wet(ctx);
    expect(wet.latency.value).toBe(300);
    expect(wet.declaredLatency).toBe(false);
  });

  it("a nested processor contributes its single latency to the parent join", async () => {
    // Wet (300, from previous test's class) on one branch, dry on the other:
    // parent aligns to 300.
    const data = await render(0.1, (ctx) => {
      const src = dirac(ctx);
      const split = new GainNode(ctx);
      const wet = new Wet(ctx);
      const join = new GainNode(ctx);
      defineGraph(
        () => [
          [src, split],
          [split, wet],
          [wet, join],
          [split, join],
          [join, ctx.destination],
        ],
        { context: ctx },
      );
    });
    expect(firstArrival(data)).toBe(300);
  });

  it("re-solves when a declared latency Param changes", async () => {
    const ctx = new AudioContext();
    const slow = new FakeLatent(ctx, 100);
    const join = new GainNode(ctx);
    const dry = new GainNode(ctx);
    const src = new GainNode(ctx);
    const handle = defineGraph(
      () => [
        [src, slow],
        [slow, join],
        [src, dry],
        [dry, join],
        [join, ctx.destination],
      ],
      { context: ctx },
    );
    expect(handle.arrivalOf(join)).toBe(100);
    slow.latency.value = 250;
    expect(handle.arrivalOf(join)).toBe(250);
  });

  it("excludes back-edges from latency", async () => {
    const ctx = new AudioContext();
    const src = new GainNode(ctx);
    const loopIn = new GainNode(ctx);
    const fb = new DelayNode(ctx, { delayTime: 0.1 });
    const handle = defineGraph(
      () => [
        [src, loopIn],
        [loopIn, fb],
        [fb, loopIn], // cycle
        [loopIn, ctx.destination],
      ],
      { context: ctx },
    );
    expect(handle.arrivalOf(loopIn)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @audiorective/core test -- --run tests/graph-latency.browser.test.ts`
Expected: FAIL — no alignment, `arrivalOf` undefined.

- [ ] **Step 3: Implement the solver**

Replace the no-op `resolve` in `graph.ts`:

```ts
// Per resolved endpoint node: latency it adds (its owning processor's, else 0).
// Wires are grouped by resolved `to` node; AudioParam sinks are skipped.

interface Solved { arrival: Map<AudioNode, number> }

function solve(wires: Wire[], nodeLatency: (n: AudioNode) => number): Solved {
  // adjacency over resolved nodes, AudioParam sinks excluded
  const incoming = new Map<AudioNode, Wire[]>();
  const outgoing = new Map<AudioNode, Wire[]>();
  for (const w of wires) {
    if (w.to instanceof AudioParam) continue;
    (outgoing.get(w.fromNode) ?? outgoing.set(w.fromNode, []).get(w.fromNode)!).push(w);
    (incoming.get(w.to) ?? incoming.set(w.to, []).get(w.to)!).push(w);
  }
  // 1. back-edge detection: iterative DFS coloring; back-edges collected into a Set<Wire>
  // 2. topological order over forward edges only
  // 3. arrival(n) = max over forward incoming wires of arrival(from) + nodeLatency(from); entry nodes = 0
  // 4. store per-wire diff = maxIncoming − (arrival(from) + nodeLatency(from))
  ...
}
```

Where:

- `nodeLatency(n)` maps a resolved `AudioNode` back to the `AudioProcessor` whose `output` it is (kept in a `Map<AudioNode, AudioProcessor>` built during edge resolution) and reads `proc.latency.value` — reading inside the effect subscribes the graph to every member's latency, so a change re-runs `apply`.
- **Entry nodes:** nodes with no forward incoming wire. When `options.owner?.input` resolves to a node in the graph, it is forced to arrival 0 even if it has incoming wires from outside knowledge (it can't — edges only exist inside this graph — so this is just the natural case).
- **Compensating delays:** the graph keeps `compDelays: Map<wireKey, DelayNode>`. After solving, for each wire with `diff > 0`: if no delay node exists or `diff/sampleRate > node.maxDelayTime`, disconnect and recreate `new DelayNode(ctx, { delayTime: diff/rate, maxDelayTime: diff/rate })` spliced as `from → delay → to` (the original direct wire is disconnected while a comp delay is in place); if one exists and fits, set `delayTime.value`. For `diff === 0`, remove any comp delay and restore the direct connection. Splicing means `connectWire`/`disconnectWire` route through a helper that knows whether the wire currently has a comp delay.
- **Derived latency:** after solving, if `options.owner && !owner.declaredLatency`, write `owner.latency.value = arrival(outputNode) + nodeLatency(outputNode)` where `outputNode` = resolved `owner.output`. Guard against no-op writes (only assign when changed) so the parent's re-solve isn't triggered redundantly.
- `arrivalOf(node)` on the handle: resolve (processor → its output node) and return `arrival + nodeLatency`, throwing if the node is not in the last solve.
- Registry for Task 4: `export const _graphRegistry = new WeakMap<AudioProcessor, { handle: GraphHandle; owner?: AudioProcessor }>()`; `apply` records every `AudioProcessor` appearing as an edge endpoint.

Watch out: the write to `owner.latency.value` happens inside the effect that also _reads_ latencies. Write it with the raw signal (`owner.latency.$(value)`) outside tracking via `alien-signals`' untracked pattern if available, or simply tolerate one extra re-run — the no-op-write guard makes it converge. State in a comment which choice was made.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @audiorective/core test -- --run tests/graph-latency.browser.test.ts tests/graph.browser.test.ts`
Expected: PASS, including the Task 2 file (splicing must not break plain wiring).

- [ ] **Step 5: Full core suite + typecheck, then commit**

Run: `pnpm --filter @audiorective/core test -- --run && pnpm --filter @audiorective/core typecheck`

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): join-point latency compensation and derived processor latency"
```

---

### Task 4: Engine root graph + `latency` / `perceivedTime` / `getPathLatency`

**Files:**

- Modify: `packages/core/src/AudioEngine.ts`
- Create: `packages/core/src/errors.ts` addition: `LatencyUnknownError`
- Modify: `packages/core/src/index.ts` (export `LatencyUnknownError`)
- Test: `packages/core/tests/engine-latency.browser.test.ts` (new)

**Interfaces:**

- Consumes: Task 3's `defineGraph` standalone form, `arrivalOf`, `_graphRegistry`.
- Produces (on `AudioEngine`, reached as `engine.core.*` by `createEngine` consumers):

```ts
readonly latency: Param<number>;                       // samples into ctx.destination; 0 with no root graph
get perceivedTime(): number;                           // currentTime + latency/rate + outputLatency
getPathLatency(proc: AudioProcessor): number;          // samples from proc's output to destination; throws LatencyUnknownError
defineGraph(fn: () => EdgeList, opts?): GraphHandle;   // engine-owned; disposed in destroy()
```

and `createEngine(setup)` calls `setup(ctx, { defineGraph })` — second argument added, existing single-arg setups unaffected.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/engine-latency.browser.test.ts
import { describe, expect, it } from "vitest";
import { AudioProcessor, LatencyUnknownError, createEngine } from "../src";

// FakeLatent: same class as in graph-latency.browser.test.ts — copy it here.

describe("engine latency queries", () => {
  const make = () =>
    createEngine((ctx, { defineGraph }) => {
      const slow = new FakeLatent(ctx, 400);
      const dry = new FakeLatent(ctx, 0);
      defineGraph(() => [
        [slow, ctx.destination],
        [dry, ctx.destination],
      ]);
      return { slow, dry };
    });

  it("latency is the longest path into the destination", () => {
    const engine = make();
    expect(engine.core.latency.value).toBe(400);
  });

  it("perceivedTime = currentTime + latency seconds + outputLatency", () => {
    const engine = make();
    const ctx = engine.core.context;
    const expected = ctx.currentTime + 400 / ctx.sampleRate + (ctx.outputLatency ?? 0);
    expect(engine.core.perceivedTime).toBeCloseTo(expected, 3);
  });

  it("getPathLatency: compensated paths all equal the max", () => {
    const engine = make();
    expect(engine.core.getPathLatency(engine.slow)).toBe(0); // 400 total − 400 own arrival
    expect(engine.core.getPathLatency(engine.dry)).toBe(400); // dry path carries the comp delay
  });

  it("getPathLatency recurses through a nested processor's graph", () => {
    const engine = createEngine((ctx, { defineGraph }) => {
      const wet = new Wet(ctx); // Wet from graph-latency tests: inner branches 100/300 — copy the class here
      defineGraph(() => [[wet, ctx.destination]]);
      return { wet, inner: wet.branchA }; // expose the inner 100-latency processor as branchA for the test
    });
    // inner branch A: compensated to 300 inside Wet, plus 0 from Wet to destination
    expect(engine.core.getPathLatency(engine.inner)).toBe(200);
  });

  it("throws LatencyUnknownError for an untracked processor", () => {
    const engine = make();
    const stray = new FakeLatent(engine.core.context, 5); // never placed in a graph
    expect(() => engine.core.getPathLatency(stray)).toThrow(LatencyUnknownError);
  });

  it("no root graph → latency 0", () => {
    const engine = createEngine(() => ({}));
    expect(engine.core.latency.value).toBe(0);
  });
});
```

(For the nested test, extend the `Wet` copy with `readonly branchA: FakeLatent` assigned in its constructor.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @audiorective/core test -- --run tests/engine-latency.browser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `LatencyUnknownError extends Error`, message names the processor's constructor name and says: place it in a `defineGraph` (its own processor's or the engine's) to make its path latency known.
- `AudioEngine.defineGraph(fn, opts)`: calls the standalone `defineGraph` with `{ context: this._context, ...opts }`, keeps handles in `_graphs`, disposes them in `destroy()`. After each solve of an engine-owned graph, if `ctx.destination` is in the solve, write `this.latency.value = arrivalOf(destination-side max)` — implement by passing the engine a callback via a `GraphOptions.onSolve?: (handle) => void` hook added in this task.
- `perceivedTime` getter: `this._context.currentTime + this.latency.value / this._context.sampleRate + (("outputLatency" in this._context && typeof this._context.outputLatency === "number") ? this._context.outputLatency : 0)`.
- `getPathLatency(proc)`: look up `_graphRegistry.get(proc)`; throw `LatencyUnknownError` if absent. Path latency within its graph = `handle.arrivalOf(sinkSide) − handle.arrivalOf(proc)` where the graph's sink side is `ctx.destination` for engine graphs or the owner's output node for processor graphs; recurse: `+ getPathLatency(ownerProcessor)` when the graph has an owner. (Compensation makes this the _aligned_ path latency, which is the number record-quantize and visualizers need.)
- `createEngine`: `setup: (context: AudioContext, helpers: { defineGraph: AudioEngine["defineGraph"] }) => ...`; pass `(engine.context, { defineGraph: (fn, o) => engine.defineGraph(fn, o) })`. Existing one-arg setups type-check unchanged (extra parameter is optional to consume in TS).

- [ ] **Step 4: Run tests + full suite + typecheck**

Run: `pnpm --filter @audiorective/core test -- --run && pnpm --filter @audiorective/core typecheck`
Expected: PASS including the existing `createEngine` tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): engine root graph, latency, perceivedTime, getPathLatency"
```

---

### Task 5: `@audiorective/devtools` — `measureLatency` + `assertLatency`

**Files:**

- Create: `packages/devtools/package.json`, `packages/devtools/tsconfig.json`, `packages/devtools/tsdown.config.ts`, `packages/devtools/vitest.config.ts` (copy each from `packages/core`'s equivalents, renaming to `@audiorective/devtools`, description "Dev-time validators for audiorective processors — impulse-based latency measurement", `dependencies: { "@audiorective/core": "workspace:^" }`)
- Create: `packages/devtools/src/measureLatency.ts`, `packages/devtools/src/assertLatency.ts`, `packages/devtools/src/index.ts`
- Create: `packages/devtools/README.md` (usage + the vitest browser-mode config snippet, copied from `packages/core/vitest.config.ts`)
- Test: `packages/devtools/tests/latency-validator.browser.test.ts`

**Interfaces:**

- Consumes: `AudioProcessor` (with `input`/`output`/`latency`) from core; Task 1's `BaseAudioContext` widening.
- Produces:

```ts
export interface MeasureOptions {
  sampleRates?: number[]; // default [44100, 48000]
  channels?: number; // default 2
  windowSeconds?: number; // default 1
  threshold?: number; // default 1e-4
}
export interface LatencyRun {
  sampleRate: number;
  firstArrival: number;
  peak: number;
}
export interface LatencyReport {
  declared: number;
  runs: LatencyRun[];
}
export function measureLatency(build: (ctx: BaseAudioContext) => AudioProcessor, opts?: MeasureOptions): Promise<LatencyReport>;
export function assertLatency(build: (ctx: BaseAudioContext) => AudioProcessor, opts?: MeasureOptions & { tolerance?: number }): Promise<void>;
```

- [ ] **Step 1: Scaffold the package and verify the workspace picks it up**

Run: `pnpm install && pnpm --filter @audiorective/devtools typecheck`
Expected: succeeds on an empty `src/index.ts` (`export {}`).

- [ ] **Step 2: Write the failing tests**

```ts
// packages/devtools/tests/latency-validator.browser.test.ts
import { describe, expect, it } from "vitest";
import { AudioProcessor } from "@audiorective/core";
import { assertLatency, measureLatency } from "../src";

const latent = (samples: number | ((rate: number) => number), declare: number | ((rate: number) => number)) => (ctx: BaseAudioContext) => {
  const actual = typeof samples === "function" ? samples(ctx.sampleRate) : samples;
  const declared = typeof declare === "function" ? declare(ctx.sampleRate) : declare;
  class P extends AudioProcessor {
    private readonly d: DelayNode;
    constructor() {
      const d = new DelayNode(ctx, { delayTime: actual / ctx.sampleRate, maxDelayTime: 1 });
      super(ctx, () => ({ latency: declared }));
      this.d = d;
    }
    override get input() {
      return this.d;
    }
    get output() {
      return this.d;
    }
  }
  return new P();
};

describe("measureLatency", () => {
  it("measures a known sample delay at both rates", async () => {
    const report = await measureLatency(latent(512, 512));
    expect(report.declared).toBe(512);
    expect(report.runs.map((r) => r.firstArrival)).toEqual([512, 512]);
  });

  it("reports peak for smeared responses", async () => {
    const report = await measureLatency(latent(100, 100));
    expect(report.runs[0].peak).toBeGreaterThanOrEqual(report.runs[0].firstArrival);
  });

  it("a waveshaper measures 0", async () => {
    const report = await measureLatency((ctx) => {
      class Shaper extends AudioProcessor {
        private readonly n: WaveShaperNode;
        constructor() {
          const curve = new Float32Array([-0.5, 0, 0.5]);
          const n = new WaveShaperNode(ctx, { curve });
          super(ctx, () => ({}));
          this.n = n;
        }
        override get input() {
          return this.n;
        }
        get output() {
          return this.n;
        }
      }
      return new Shaper();
    });
    expect(report.runs.every((r) => r.firstArrival === 0)).toBe(true);
  });
});

describe("assertLatency", () => {
  it("passes a correct samples declaration", async () => {
    await expect(assertLatency(latent(512, 512))).resolves.toBeUndefined();
  });

  it("fails a wrong declaration and suggests samples", async () => {
    await expect(assertLatency(latent(512, 502))).rejects.toThrow(/latency: 512/);
  });

  it("passes a correct time-based declaration", async () => {
    const tenMs = (rate: number) => Math.round(0.01 * rate);
    await expect(assertLatency(latent(tenMs, tenMs))).resolves.toBeUndefined();
  });

  it("fails a time-based latency declared as a literal, suggesting seconds", async () => {
    const tenMs = (rate: number) => Math.round(0.01 * rate);
    await expect(assertLatency(latent(tenMs, 441))).rejects.toThrow(/Math\.round\(0\.01 \* ctx\.sampleRate\)/);
  });

  it("a compensated composite passes with tolerance 0", async () => {
    // Wet from core's graph-latency tests (two unequal branches joined): copy
    // the class here. Its derived latency is 300 and its join is compensated.
    await expect(assertLatency((ctx) => new Wet(ctx), { tolerance: 0 })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @audiorective/devtools test -- --run`
Expected: FAIL — functions not implemented.

- [ ] **Step 4: Implement**

`measureLatency.ts`:

```ts
export async function measureLatency(build, opts = {}) {
  const { sampleRates = [44100, 48000], channels = 2, windowSeconds = 1, threshold = 1e-4 } = opts;
  const runs = [];
  let declared = 0;
  for (const sampleRate of sampleRates) {
    const ctx = new OfflineAudioContext(channels, Math.ceil(windowSeconds * sampleRate), sampleRate);
    const proc = build(ctx);
    if (!proc.input || !proc.output) throw new Error("measureLatency: processor must expose input and output");
    declared = proc.latency.value;
    const buffer = new AudioBuffer({ length: 1, sampleRate });
    buffer.getChannelData(0)[0] = 1;
    const src = new AudioBufferSourceNode(ctx, { buffer });
    src.connect(proc.input);
    proc.output.connect(ctx.destination);
    src.start(0);
    const rendered = await ctx.startRendering();
    let firstArrival = -1,
      peak = 0,
      peakAbs = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
      const data = rendered.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const a = Math.abs(data[i]);
        if (a > threshold && (firstArrival === -1 || i < firstArrival)) firstArrival = i;
        if (a > peakAbs) {
          peakAbs = a;
          peak = i;
        }
      }
    }
    if (firstArrival === -1)
      throw new Error(
        "measureLatency: no output detected — is the processor audible in its default state? Set it (wet, gate) inside the build factory.",
      );
    runs.push({ sampleRate, firstArrival, peak });
  }
  return { declared, runs };
}
```

`assertLatency.ts` — compare each run's `firstArrival` to `declared` within `tolerance` (default 1). On failure, build the message:

```ts
const scales =
  runs.length >= 2 &&
  Math.abs(runs[0].firstArrival / runs[0].sampleRate - runs[1].firstArrival / runs[1].sampleRate) * runs[1].sampleRate <= tolerance;
const constant = runs.length >= 2 && Math.abs(runs[0].firstArrival - runs[1].firstArrival) <= tolerance;

// message lines:
//   <name> latency mismatch
//     declared   <declared>
//     measured   <fa1> @<rate1> · <fa2> @<rate2>   (first arrival; peak <p1> · <p2>)
// then exactly one of:
//   constant → "Constant across sample rates — declare it in samples:\n  latency: <fa>"
//   scales   → "Measured latency scales with sample rate — declare it as time:\n  latency: Math.round(<seconds> * ctx.sampleRate)"
//              where <seconds> is firstArrival/sampleRate rounded to the shortest
//              decimal (up to 6 places) that reproduces both runs' samples
//   neither  → "Latency fits neither a samples nor a time model; measure by hand."
```

`<name>` = `proc.constructor.name`. Passing runs that merely disagree with each other beyond tolerance also fail (the "neither" branch).

- [ ] **Step 5: Run tests, then commit**

Run: `pnpm --filter @audiorective/devtools test -- --run && pnpm --filter @audiorective/devtools typecheck`

```bash
git add packages/devtools pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(devtools): impulse latency validator (measureLatency, assertLatency)"
```

(`pnpm-workspace.yaml` already globs `packages/*` — include it only if it changed.)

---

### Task 6: Docs, changelog, AGENTS correction

**Files:**

- Modify: `docs/core.md` (new "Graph helpers (`defineGraph`)" and "Latency (PDC)" sections; `input`/`output` section gains `latency`), `docs/architecture.md` (audio-layer list adds graph wiring rule), `docs/designing-audio-apps.md` (channel-strip guidance shows the `defineGraph` composition), `docs/overview.md` (roadmap line: PDC shipped in core), `AGENTS.md` (design rule 6: `defineNodes`/`connectNodes` → `defineGraph`), `CHANGELOG.md`
- No code, no tests. Content requirements per file:

- [ ] **Step 1: `docs/core.md`** — document, with runnable examples mirroring the shipped API: edge forms (`[from, to]`, conditional falsy entries, `AudioParam` sinks like `[lfo, filter.frequency]`, `{ output, input, label }`), the worklet rejection and its reason, `this.defineGraph` vs standalone `defineGraph(fn, { context })`, `compensate: false`, `latency` (declare number / declare param / derive; the samples-vs-time rule with `Math.round(0.01 * ctx.sampleRate)`), engine queries (`engine.core.latency`, `perceivedTime`, `getPathLatency`, `LatencyUnknownError`), and a "what counts as latency" paragraph (processing delay vs musical delay, verbatim from the spec's 1.1).
- [ ] **Step 2: `docs/architecture.md`, `docs/designing-audio-apps.md`, `docs/overview.md`, `AGENTS.md`** — the targeted edits listed above; keep each to its file's existing voice and length.
- [ ] **Step 3: `CHANGELOG.md`** — Unreleased entry: **core:** `defineGraph`, `AudioProcessor.latency`, `BaseAudioContext` widening, engine latency queries, `LatencyUnknownError`; **devtools:** new package, `measureLatency`/`assertLatency`.
- [ ] **Step 4: Verify** — `pnpm --filter @audiorective/core typecheck` still passes (docs-only change; this catches accidental code edits) and every code sample in the new doc sections uses only exported names (grep each identifier against `packages/core/src/index.ts` / `packages/devtools/src/index.ts`).
- [ ] **Step 5: Commit**

```bash
git add docs AGENTS.md CHANGELOG.md
git commit -m "docs: graph helpers, latency compensation, devtools"
```

---

### Task 7: `docs/authoring-processors.md` + `audio-processor-authoring` skill

**Files:**

- Create: `docs/authoring-processors.md`
- Create: `skills/audio-processor-authoring/SKILL.md`
- Create: `skills/audio-processor-authoring/references/authoring-processors.md` (symlink to `../../../docs/authoring-processors.md`, matching how `skills/audiorective/references/*` symlink into `docs/`)
- Modify: `skills/audiorective/SKILL.md` ("What to read next" gains: "Writing or modifying an `AudioProcessor` subclass → the `audio-processor-authoring` skill")
- Modify: `docs/architecture.md` (one line linking to the new doc for "how to write the class")

**Interfaces:**

- Consumes: everything shipped in Tasks 1–5 (the doc documents the finished surface — do not run this task before them).
- Produces: a second plugin skill; the manifest (`"skills": "./skills/"`) picks it up with no manifest change.

- [ ] **Step 1: Write `docs/authoring-processors.md`** with the spec's seven sections (3.2), each with a wrong/right pair in the style of `docs/architecture.md`:
  1. **Skeleton** — locals before `super()`; build callback returning `{ params, cells?, latency? }`; `output` required, `input` for effects; `this` assignments after `super()`.
  2. **State** — `param` vs `schedulableParam` vs `cell`; the `bind` table (copy from `AGENTS.md`); when to use a plain `Cell` class instead.
  3. **Graph** — `this.defineGraph` over direct references; conditional edges for bypass; `AudioParam` sinks; nesting processors; when raw `.connect()` is fine (a leaf connection inside the processor that never joins another path).
  4. **Latency** — processing delay vs musical delay; declare vs derive; time-based declared from `ctx.sampleRate`; wrap worklets.
  5. **Lifecycle** — what `destroy()` cleans (effects, params, constant sources, graphs) vs what the subclass adds (`stop()` on sources, worklet ports).
  6. **Testing** — headless recipe (vitest browser mode; a path to `ctx.destination` or automations don't advance); the `assertLatency` pin test as the default for every processor with `input`, with the exact snippet from `packages/devtools/README.md`.
  7. **Checklist** — the six above as one review list.
- [ ] **Step 2: Write `SKILL.md`** with frontmatter `name: audio-processor-authoring` and the trigger description from spec 3.1, a short body pointing at `references/authoring-processors.md`, and the checklist inline.
- [ ] **Step 3: Create the symlink and routing edits**; verify the symlink resolves (`cat skills/audio-processor-authoring/references/authoring-processors.md | head -3`).
- [ ] **Step 4: Verify every API name in the doc exists** — grep each identifier used in code samples against the package `index.ts` exports.
- [ ] **Step 5: Commit**

```bash
git add docs/authoring-processors.md docs/architecture.md skills
git commit -m "docs(skill): audio-processor-authoring skill"
```

---

## Execution notes

- Task order is 1 → 2 → 3 → 4 → 5 → 6 → 7; 1 and 2 are independently mergeable milestones, 5 needs 1+3, 6–7 document the finished surface.
- After Task 5, run the full workspace check once: `pnpm -r typecheck && pnpm -r test -- --run`.
- Anything discovered mid-task that contradicts the spec (e.g. an alien-signals effect subtlety in the derived-latency write-back) gets resolved in favor of the spec's observable behavior, with the deviation noted in the commit message and, if it changes the public API, in the spec file itself.
