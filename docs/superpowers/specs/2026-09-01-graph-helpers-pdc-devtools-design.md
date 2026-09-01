# Graph Helpers with Latency Compensation + `@audiorective/devtools` — Design

_Status: approved design, ready for implementation planning. Date: 2026-09-01._

## Goal

Give `@audiorective/core` a declarative, reactive way to wire an audio graph
that also knows the graph's latency — and compensates for it automatically, the
way a DAW's plugin delay compensation (PDC) does. Ship a small dev-only package
that makes every declared latency checkable in CI.

Three deliverables:

1. **core** — `defineNodes` / `defineGraph` graph helpers, a `latency` reading on
   every `AudioProcessor`, join-point compensation inside any graph, and
   engine-level queries (`engine.latency`, `engine.perceivedTime`,
   `engine.getPathLatency`).
2. **`@audiorective/devtools`** — an `OfflineAudioContext` impulse validator
   (`assertLatency` / `measureLatency`) whose failure message tells the author
   exactly what to declare.
3. **skill** — an `audio-processor-authoring` skill in the plugin that teaches
   the whole of writing an `AudioProcessor` subclass: state, graph, latency,
   lifecycle, tests.

## Background

- The Notion pages "Latency Compensation (PDC)", "@audiorective/effects" and the
  "Graph Helpers (not yet implemented)" section of "@audiorective/core" describe
  the intent. This spec merges the first and third: the graph helper's edge list
  is the topology PDC needs, so compensation is a feature of the graph helper
  rather than a separate subsystem.
- The tmc-cl1 field report (2026-08-24) evidences the need: a hand-tuned
  `LATENCY_COMPENSATION = 0.1` starts a dry metronome late to line up with pads
  routed through a pitch-shift chain, and subtracts the same constant back out
  in record quantization. Both uses collapse into `latency` + `getPathLatency`.
- `AGENTS.md` already lists `defineNodes`/`connectNodes` as a design rule; they
  do not exist in `packages/core/src`. This spec is where they get built (with
  `defineGraph` as the connection half).

## Decisions (locked)

| Decision                      | Choice                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Compensation model            | Local: solved per graph at join points; nested graphs compose through each processor's single `latency` number                  |
| Compensated scope             | Only edges declared through `defineGraph`. Raw `.connect()` is neither tracked nor compensated                                  |
| Node types                    | `defineNodes` accepts native `AudioNode`s (latency 0) and `AudioProcessor`s (their `latency`); bare `AudioWorkletNode` rejected |
| Native-node wrapper           | None. A worklet is wrapped by writing the `AudioProcessor` that declares its latency                                            |
| Latency unit                  | Samples. Converted to seconds only when writing a compensating `DelayNode`                                                      |
| Latency source on a processor | Derived from its own graph when it uses `defineGraph`; a value declared in the build callback overrides the derived one         |
| Cycles                        | Allowed to wire; back-edges excluded from latency computation                                                                   |
| Mixing primitives             | Not in core. `Chain`/`Bus`/`Channel` are consumer compositions on top of `defineGraph`                                          |
| Devtools runtime              | Library only, run under vitest browser mode. No CLI, no live-engine introspection                                               |
| Devtools workflow             | One function (`assertLatency`), one test; the failure message carries the declaration to paste                                  |
| Skill                         | New `audio-processor-authoring` skill in the plugin, backed by a new `docs/authoring-processors.md`                             |
| Out of scope                  | `@audiorective/effects`, clock integration of `perceivedTime`, cross-graph solo, end-to-end root-graph measurement              |

---

## Part 1 — core

### 1.1 `AudioProcessor.latency`

Every processor exposes `readonly latency: Param<number>` — its processing
latency in samples: the fixed delay before the earliest output for an impulse
at the input. Intentional musical delay (a delay line, a reverb tail, chorus
modulation) is not latency; those effects declare 0.

- Default `0`. Existing processors (`Spatial`, `Analyser`, `Sampler`,
  `BufferPlayer`, `FilePlayer`) declare nothing and stay at 0.
- Declared in the build callback: `latency: 512`, or
  `latency: param({ default: 512 })` when it changes at runtime (a limiter whose
  lookahead is a param). Time-based latencies are declared from the context so
  they survive a sample-rate change between contexts:
  `latency: Math.round(0.01 * ctx.sampleRate)`.
- **Derived** when the processor calls `defineGraph` and declares nothing: the
  longest path in samples from `input` to `output` through its own graph. A
  processor that declares a value and also has a graph uses the declared value
  (a worklet-backed processor may still use `defineGraph` for its surrounding
  wiring).
- `AudioProcessor.context` widens from `AudioContext` to `BaseAudioContext` so
  processors construct against an `OfflineAudioContext`. The silencer's
  `connect(context.destination)` is unchanged and harmless offline.

### 1.2 `defineNodes`

```ts
const nodes = defineNodes({
  osc: new OscillatorNode(ctx),
  filter: new BiquadFilterNode(ctx),
  shifter: new PitchShift(ctx), // an AudioProcessor
  out: new GainNode(ctx),
});
```

- Accepts a record whose values are `AudioNode | AudioProcessor`. Returns the
  same record, typed, so every key is known at compile time. The keys `input`,
  `output` and `destination` are reserved for edge endpoints (1.3, 1.5) and are
  a type error as node names.
- `AudioWorkletNode` is rejected at the type level (structurally: a value with
  `port` and `parameters`) and at runtime (`instanceof` throws). Its latency is
  unknowable from outside; wrap it in a processor that declares.
- Native nodes contribute latency 0 — true per spec for every built-in node,
  including `ConvolverNode` and `DelayNode` (whose delay is intentional, not
  latency).
- Available as a build helper alongside `param`/`cell` and as a standalone
  export; the two are the same function.

### 1.3 `defineGraph`

```ts
this.graph = defineGraph(nodes, () => [
  ["osc", "filter"],
  ["filter", this.params.useShifter.value ? "shifter" : "out"],
  this.params.useShifter.value && ["shifter", "out"],
  ["lfo", "filter", { param: "frequency" }],
]);
```

- Runs the edge function inside an `effect()` owned by the processor. On every
  re-evaluation it diffs the new edge list against the current one, applies the
  minimal `connect`/`disconnect` calls, then re-solves compensation.
- Edge shape: `[from, to]` or `[from, to, { output?: number; input?: number; param?: string }]`.
  `from` and `to` are keys of the node map, `"input"` (the processor's own
  input, when it has one) or `"output"` (the processor's own output). Falsy
  entries are skipped so edges can be conditional inline.
- An `AudioProcessor` node connects through its `input`/`output`; an edge into
  a processor with no `input` is a type error.
- `param` edges target an `AudioParam` on a native node (or a
  `SchedulableParam`'s backing param on a processor). They carry no latency.
- Returns a handle with `dispose()`; `AudioProcessor.destroy()` disposes any
  graph the processor created.
- A processor's `input`/`output` getters remain the developer's to write;
  `defineGraph` never invents nodes.

### 1.4 Compensation

Performed on every re-solve, on the edge list as a directed graph:

1. Detect back-edges (DFS). They are wired normally but excluded from latency
   computation; Web Audio requires a `DelayNode` inside any cycle already.
2. Compute `arrival(node)` = longest path in samples from any graph input
   (nodes with no incoming compensated edge, or the processor's own `input`) to
   `node`, where each node adds its own latency (`0` for native nodes,
   `proc.latency.value` for processors). `param` edges do not participate.
3. At every node with ≥2 incoming non-param edges, for each incoming edge whose
   `arrival(from) + latency(from)` is less than the maximum, keep a
   helper-owned `DelayNode` on that edge with
   `delayTime = diffSamples / ctx.sampleRate`. Edges at the maximum have no
   delay node.
4. The processor's derived `latency` is `arrival(output)`.

Mechanics:

- Compensating delays are created per edge on demand and removed when the edge
  is removed or its diff becomes 0. `DelayNode.maxDelayTime` is fixed at
  construction, so the node is recreated (not just retuned) when a re-solve
  needs a larger value.
- Diffs are integer samples divided by the context's own rate, so the delay
  maps back to whole samples — no fractional-delay interpolation.
- `latency` values are `Param`s, so a re-solve is triggered by the same effect
  that tracks the edge function: reading `proc.latency.value` during the solve
  subscribes to it.
- `defineGraph(nodes, fn, { compensate: false })` keeps the diffing and turns
  compensation off for that graph.

### 1.5 Root graph and engine queries

The engine's setup receives the same helpers:

```ts
const engine = createEngine(({ ctx, defineNodes, defineGraph }) => {
  const nodes = defineNodes({ machine: new CassetteMachine(ctx), metronome: new Metronome(ctx) });
  defineGraph(nodes, () => [
    ["machine", "destination"],
    ["metronome", "destination"],
  ]);
  return { ...nodes };
});
```

- The root graph's sink is `"destination"` (`ctx.destination`). It is the one
  graph the engine owns; compensation at the destination join works exactly as
  in 1.4.
- `engine.latency: Param<number>` — samples, longest path into the destination.
- `engine.perceivedTime` — `ctx.currentTime + engine.latency / sampleRate + ctx.outputLatency`
  (`outputLatency` read as 0 where unsupported). What visualizers and
  record-quantize should compare against instead of `currentTime`.
- `engine.getPathLatency(proc)` — samples from `proc`'s output to the
  destination: `proc`'s owning graph knows `arrival(output)` for it, plus the
  owning processor's own path, recursively. Every processor records the graph
  that owns it when it is placed in one; a processor in no graph throws
  `LatencyUnknownError` naming the processor. That is the accepted limitation
  made loud rather than silently 0.
- The existing setup signature `createEngine((ctx) => …)` stays valid; the
  helpers object is passed as a second argument, so no consumer breaks.

### 1.6 Not in core

`Chain`, `Bus`, `Channel` are each a ~20-line processor on `defineGraph`. They
stay app-side (livehouse's `Channel`) until a second consumer needs them. The
`designing-audio-apps.md` "source-agnostic channel strip" guidance is updated to
show the `defineGraph` version.

### 1.7 Documentation

- `docs/core.md`: new "Graph helpers" and "Latency" sections; `input`/`output`
  section gains the `latency` reading.
- `docs/architecture.md`: the audio-layer list adds "graph wiring via
  `defineGraph`; raw `.connect()` only for leaf nodes inside a processor".
- `AGENTS.md`: design rule 6 corrected from `connectNodes` to `defineGraph`.
- `skills/audiorective/`: rule and reference for graph helpers and latency.
- `CHANGELOG.md` entry.

### 1.8 Tests (vitest browser mode, headless Chromium)

- Diffing: add / remove / rewire edges produce exactly the expected
  connections; disposing leaves none (verified by rendering silence through an
  offline context after dispose).
- Type tests: unknown key, edge into a processor without `input`, bare
  `AudioWorkletNode` — all compile errors.
- Derived latency: serial sum; parallel max; nested processor contributes one
  number; declared value overrides derived.
- Alignment: impulse through a two-branch join with unequal declared latency
  (one branch a `DelayNode` standing in for buffering, declared via a tiny
  processor) arrives on the same output sample from both branches.
- Bypass: toggling a conditional edge in and out moves the impulse's arrival
  at the output by exactly the removed processor's latency, and a parent graph
  re-aligns its join.
- Back-edge: a feedback loop wires and renders; its edges do not affect
  `latency`.
- Engine: `engine.latency` and `getPathLatency` through two nesting levels;
  `getPathLatency` on an unplaced processor throws.
- Regression: the existing suites for `Spatial`, `Analyser`, players and
  `createEngine` pass unchanged.

---

## Part 2 — `@audiorective/devtools`

### 2.1 Package

`packages/devtools`, published as `@audiorective/devtools`, `devDependency` for
consumers, depends on `@audiorective/core` (`workspace:^`). Never imported from
app code. Runs anywhere Web Audio exists; the documented harness is vitest
browser mode, and the README carries the `vitest.config` snippet for a repo
that lacks it.

### 2.2 API

```ts
type MeasureOptions = {
  sampleRates?: number[];   // default [44100, 48000]
  channels?: number;        // default 2
  windowSeconds?: number;   // default 1
  threshold?: number;       // default 1e-4, |x| above this counts as arrival
};

type LatencyReport = {
  declared: number;
  runs: { sampleRate: number; firstArrival: number; peak: number }[];
};

measureLatency(build: (ctx: BaseAudioContext) => AudioProcessor, opts?: MeasureOptions): Promise<LatencyReport>;
assertLatency(build, opts?: MeasureOptions & { tolerance?: number /* default 1 */ }): Promise<void>;
```

`build` is a factory, not an instance: it is called once per sample rate with a
fresh `OfflineAudioContext`, and is where the author puts the processor into its
measurable state (`wet = 1`, gate open). The validator never guesses at params.

### 2.3 Mechanism

Per sample rate: `OfflineAudioContext(channels, windowSeconds * rate, rate)` →
`AudioBufferSourceNode` playing a one-sample Dirac at t = 0 → `proc.input` →
`proc.output` → `destination` → `startRendering()`. `firstArrival` = first index
on any channel with `|x| > threshold`; `peak` = argmax `|x|`. Nonlinear
processors change the impulse's shape, not its arrival, so both stay
meaningful; `peak` is reported so a smeared response (granular pitch shift) is
visible as such.

### 2.4 Assertion and message

`assertLatency` fails when any run's `firstArrival` differs from `declared` by
more than `tolerance`, or when runs disagree with each other beyond
`tolerance`. The message is the workflow — it carries the declaration to paste:

```
PitchShift latency mismatch
  declared   0
  measured   441 @44100 · 480 @48000   (first arrival; peak 452 · 491)

  Measured latency scales with sample rate — declare it as time:
    latency: Math.round(0.01 * ctx.sampleRate)
```

```
  measured   512 @44100 · 512 @48000
  Constant across sample rates — declare it in samples:
    latency: 512
```

Heuristic: if the first-arrival ratio matches the sample-rate ratio within
`tolerance`, suggest seconds (`firstArrival / sampleRate`, rounded to the
shortest decimal that reproduces the samples at both rates); if the arrivals
are equal, suggest samples; otherwise print both numbers with no suggestion and
say the latency fits neither model.

### 2.5 Workflow

An author writes the pin test with whatever the processor currently declares,
runs it, pastes what the failure says, runs it green. The test stays as the CI
guard against a later change in buffering. App authors use the same call on a
composite processor to prove a compensated join actually aligns — a composite
built with `defineGraph` is just an `AudioProcessor`.

### 2.6 Tests

- A processor wrapping `DelayNode(N samples)` declared N passes; declared N−10
  fails with the samples suggestion; a time-declared processor with a
  `DelayNode(10 ms)` passes at both rates; the same declared as a literal fails
  with the seconds suggestion.
- A `WaveShaperNode` processor measures 0.
- A composite `defineGraph` processor with two unequal branches joined measures
  its derived `latency` — the end-to-end proof that Part 1's compensation
  aligns samples.
- The heuristic's "neither model" branch on hand-built runs.

---

## Part 3 — `audio-processor-authoring` skill

A second skill in the plugin, next to the existing `audiorective` skill (the
plugin manifest already loads every directory under `skills/`). The existing
skill is the app-level entry point; this one is the class-level guide for
anyone writing or modifying an `AudioProcessor` subclass, which is where every
concept in this spec lands.

### 3.1 Trigger

"Use when writing, extending, or reviewing an `AudioProcessor` subclass — a
synth, effect, sampler, analyser, or any class that owns Web Audio nodes:
params and cells, `bind` rules, `input`/`output`, graph wiring with
`defineGraph`, latency declaration, `destroy`, and headless tests."

### 3.2 Content — one reference, `docs/authoring-processors.md`

Written as the single source and symlinked into
`skills/audio-processor-authoring/references/`, the same arrangement the
existing skill uses. Sections, each with the wrong/right pair the existing
docs favor:

1. **Skeleton** — locals before `super()`, build callback returning
   `{ params, cells?, latency? }`, `output` (required) and `input` (effects
   only), what goes on `this` after `super()`.
2. **State** — `param` vs `schedulableParam` vs `cell`; the `bind` table; when
   a class should be a plain `Cell` class instead (from `architecture.md`).
3. **Graph** — `defineNodes` / `defineGraph`; conditional edges for bypass;
   `param` edges; nesting processors; when raw `.connect()` is still fine (a
   leaf node inside the processor with no join).
4. **Latency** — what counts (processing delay) and what doesn't (musical
   delay); declare vs derive; declare time-based latency from `ctx.sampleRate`;
   `AudioWorkletNode` must be wrapped.
5. **Lifecycle** — what `destroy()` already cleans up (effects, params,
   constant sources, graphs) and what the subclass must add (`stop()` on
   sources, worklet ports).
6. **Testing** — the headless recipe (vitest browser mode, a path to
   `ctx.destination`), and the `assertLatency` pin test as the default test
   every processor with `input` ships with.
7. **Checklist** — the six items above as a review list.

### 3.3 Routing

The existing `audiorective` skill's "What to read next" table gains a row:
"Writing or modifying an `AudioProcessor` subclass → the
`audio-processor-authoring` skill". `architecture.md` keeps its role (where
logic lives) and links to the new doc for how to write the class.

---

## Phasing

1. `AudioProcessor.latency` + `BaseAudioContext` widening (no behavior change).
2. `defineNodes` / `defineGraph` with diffing and disposal, no compensation.
3. Compensation solver + derived latency.
4. Root graph on `createEngine` + `engine.latency` / `perceivedTime` /
   `getPathLatency`.
5. `@audiorective/devtools`.
6. Docs, changelog, `AGENTS.md` correction.
7. `docs/authoring-processors.md` + the `audio-processor-authoring` skill.

Phases 1–2 are independently mergeable; 5 needs 1 and 3; 7 needs everything
before it, since it documents the finished surface.
