# Latency Lab — Showroom Demo for `defineGraph` + PDC — Design

_Status: approved design, ready for implementation planning. Date: 2026-09-02._

## Goal

A standalone showroom demo (`/showroom/latency-lab`) that makes both halves
of the graph feature visible at once: **reactive graph wiring** (edges
rewiring live as a bypass toggles) and **latency compensation** (a parallel
dry path audibly and visibly snapping into alignment with a latent effect when
PDC is on). It is also the first consumer of a small core addition —
`GraphHandle.snapshot()` — so the diagram renders the solver's own output
rather than a hand-mirrored model.

Depends on the graph/PDC/devtools work in
`docs/superpowers/specs/2026-09-01-graph-helpers-pdc-devtools-design.md`
(branch `feat/graph-pdc-devtools`, PR #27).

## Decisions (locked)

| Decision      | Choice                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Form          | New standalone demo under `apps/web/src/demos/latency-lab`, route `/showroom/latency-lab`, card on the showroom index              |
| Scenario      | Drum kit (kick/snare/hat samplers on a fixed one-bar pattern) split into a latent "lookahead limiter" path and a dry path          |
| Latent effect | Demo-local `AudioWorkletNode` lookahead limiter wrapped in an `AudioProcessor` that declares a Param-backed, slider-driven latency |
| Graph visual  | Live SVG diagram rendered from `GraphHandle.snapshot()` re-read on `onSolve`; hand-placed static layout, no layout library         |
| Diagram data  | Core introspection API (`snapshot()`), never a demo-side mirror of the solver's arithmetic                                         |
| PDC toggle    | `compensate` is a graph-creation option: the toggle disposes and re-creates the root graph with the flag flipped                   |
| A/V sync      | Pad/click flashes timed through `engine.core.perceivedTime`                                                                        |
| Tests         | Headless audio tests (offline impulse renders) + pure-function test for flash timing; no component render tests                    |
| Out of scope  | Pattern editing, additional effects, force layout, a general devtools panel                                                        |

---

## Part 1 — core: `GraphHandle.snapshot()` and public `onSolve`

### 1.1 Snapshot

```ts
interface GraphSnapshot {
  solveId: number; // increments per solve
  nodes: {
    id: number; // stable per endpoint for the life of the graph
    kind: "native" | "processor";
    label: string; // constructor name
    latency: number; // samples this node contributes (0 for native)
    arrival: number; // solved arrival in samples
  }[];
  edges: {
    from: number;
    to: number; // node ids
    label?: string; // EdgeOptions.label
    kind: "audio" | "param" | "virtual" | "back";
    compensationSamples: number; // 0 when no compensating delay is spliced
  }[];
}
```

- `handle.snapshot(): GraphSnapshot` is built on demand from the solver's
  existing state (current wires, arrival map, per-wire diffs, back-edge set,
  virtual wires). No bookkeeping is added to the solve path.
- Node ids reuse the solver's identity ids, so they are stable across
  re-solves while an endpoint stays in the graph.
- `param` edges, back-edges and virtual edges are included with their kind;
  consumers filter. A composite processor therefore appears as one node with
  a virtual internal edge.
- Read-only; no layout, no mutation, no subscription beyond `onSolve`.

### 1.2 `onSolve` becomes public

`GraphOptions.onSolve?: (handle: GraphHandle) => void` is documented in
`docs/core.md` as the way to observe re-solves (one paragraph). `owner` stays
internal.

### 1.3 Tests and docs

- Snapshot of the two-branch join fixture: node kinds and arrivals, exactly
  one edge with `compensationSamples` equal to the branch difference.
- A latency change bumps `solveId` and updates that edge's compensation.
- `compensate: false` snapshots with all compensation zeros.
- The feedback fixture reports `back` and `virtual` kinds.
- `CHANGELOG.md` Unreleased: **core** Added `GraphHandle.snapshot()`,
  documented `onSolve`.

---

## Part 2 — demo audio core (`apps/web/src/demos/latency-lab/audio/`)

### 2.1 Sources

- `Beat` — an `AudioProcessor` owning three `Sampler`s (kick, snare, hat)
  and a fixed one-bar pattern scheduled from a `@audiorective/clock` grid
  loop (the sequencer demo remains the clock showcase; no editing here).
  Output-only.
- `Click` — a synthesized metronome tick (short enveloped oscillator burst)
  on the same clock, output-only. It is the reference the ear compares
  everything against.

### 2.2 `LookaheadLimiter`

- Demo-local worklet (`limiter.worklet.ts`): a ring-buffer delay of
  `lookahead` samples plus a peak-tracking gain computer applied to the
  delayed signal — simple, real DSP whose latency is exactly the ring
  buffer length.
- Wrapped in an `AudioProcessor` with `input`/`output` and
  `latency: param({ default: Math.round(0.02 * ctx.sampleRate) })`. The
  lookahead slider (5–100 ms) writes that Param; a bind effect forwards the
  sample count to the worklet through its message port. Moving the slider
  therefore re-solves the graph live.
- Ships with an `@audiorective/devtools` `assertLatency` pin test. If
  `apps/web` has no browser-mode vitest harness, the test gets a minimal
  `vitest.config.ts` beside it mirroring `packages/core`'s.

### 2.3 Root graph

One engine-owned `defineGraph` built by `buildGraph(compensate: boolean)`:

```
beat  → split
split → limiter → master       (conditional: limiterBypassed === false)
split → dry    → master        (the join PDC compensates)
click → master
master → destination
```

- `limiterBypassed: Param<boolean>` is read inside the edge function, so
  bypass is a rewire the diagram shows. Bypass removes the wet branch and
  adds nothing in its place — the dry path already carries the signal, and a
  substitute `split → master` edge would double it.
- The PDC toggle disposes the current handle and calls
  `buildGraph(!compensate)`. Toggling mid-playback re-wires audibly for a
  moment; the UI says so next to the switch.
- Readings exposed to the UI: `engine.core.latency`,
  `engine.core.perceivedTime`, `engine.core.getPathLatency(beat)` and
  `(click)`.

### 2.4 Headless tests

- Offline impulse renders through the demo graph: with `compensate: true`
  the dry and limited copies of a hit arrive on the same sample; with
  `false` they are `latency` samples apart.
- Bypass toggling rewires (limited copy absent) without shifting the dry
  path's timing while PDC is on.
- Lookahead change re-solves: `engine.core.latency` follows the Param.
- `flashTime(hitTime, perceivedOffset)` pure-function test.

---

## Part 3 — diagram, UI, docs

### 3.1 Diagram

- An SVG component fed by `snapshot()` on every `onSolve` (plus once on
  mount). Six fixed node positions keyed by node label.
- Nodes: labeled boxes; processors show `latency` in samples.
- Edges: arrows; the limiter/bypass pair appears and disappears with the
  toggle. An edge with `compensationSamples > 0` carries an inline
  `⏱ N` badge — the compensating delay made visible.
- Join arrivals labeled; header strip shows `engine.latency` (samples and
  ms) and PDC state.
- `virtual`, `back` and `param` kinds are filtered out for this topology
  but tolerated by the renderer.

### 3.2 Controls

Transport (play/stop), PDC toggle, limiter bypass, lookahead slider,
click on/off, master volume. A flash row (kick, snare, hat, click) lights on
perceived time; with PDC off the flashes and the audible hits disagree per
path, with PDC on they lock.

### 3.3 Page and docs

- `apps/web/src/pages/showroom/latency-lab.astro` + a card on the showroom
  index, matching existing entries.
- `apps/web/src/demos/latency-lab/README.md` in the sequencer README's
  style: numbered "what it demonstrates" (graph rewiring, PDC alignment,
  dynamic latency re-solve, `perceivedTime` A/V sync, the wrap-the-worklet
  rule, headless testing) and a structure table.
- One link line from `docs/core.md`'s PDC section to the demo.

### 3.4 Tests

No component render tests; the audio core and the flash-timing function
carry the coverage.
