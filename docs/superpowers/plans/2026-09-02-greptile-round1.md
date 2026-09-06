# Greptile Round 1 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three lifecycle findings from Greptile's review of PR #27 so engine latency, the graph registry, and devtools measurement all clean up correctly.

**Architecture:** Three contained fixes in the existing graph/engine/devtools code: an engine-owned graph that stops reaching the destination drops its latency record; the graph registry forgets processors that leave the edge list or whose graph is disposed; `measureLatency` destroys each per-run processor.

**Tech Stack:** TypeScript, alien-signals, Web Audio, vitest browser mode.

**Spec:** `docs/superpowers/specs/2026-09-01-graph-helpers-pdc-devtools-design.md` (§1.5 engine queries: `latency` = longest path currently into the destination; `getPathLatency` on an untracked processor throws `LatencyUnknownError`, never an internal error).

## Global Constraints

- Branch `feat/graph-pdc-devtools`; commit directly; push is done by the controller.
- Latency unit samples; `LatencyUnknownError` is the ONLY error `getPathLatency` throws for an unplaced/removed processor.
- No new runtime dependencies; comments describe the present; TDD; test output pristine.
- Commands: `pnpm --filter @audiorective/core test -- --run`, `pnpm --filter @audiorective/core typecheck`, `pnpm --filter @audiorective/core build` (devtools consumes the built dist), `pnpm --filter @audiorective/devtools test -- --run`, `pnpm --filter @audiorective/devtools typecheck`.
- Pre-commit hook runs prettier repo-wide; confirm commits with `git log`.
- `CHANGELOG.md` `[Unreleased]` gains a `### Fixed` section describing the three behavior fixes (core ×2, devtools ×1).

---

### Task 1: Engine latency drops a graph that no longer reaches the destination

**Files:**

- Modify: `packages/core/src/AudioEngine.ts` (the `onSolve` wrapper around `arrivalOf(ctx.destination)`, currently keeping the previous value in its catch)
- Test: `packages/core/tests/engine-latency.browser.test.ts`

**Interfaces:** consumes `GraphHandle.arrivalOf`, the per-graph `_graphLatency` map and `_recomputeLatency()`.

- [ ] **Step 1: Failing test** — in `engine-latency.browser.test.ts` add:

```ts
it("drops a graph's contribution when it disconnects from the destination", () => {
  const connected = new Param<boolean>({ default: true });
  const engine = createEngine((ctx, { defineGraph }) => {
    const slow = new FakeLatent(ctx, 400);
    defineGraph(() => [connected.value && [slow, ctx.destination]]);
    return { slow };
  });
  expect(engine.core.latency.value).toBe(400);
  connected.value = false;
  expect(engine.core.latency.value).toBe(0);
});
```

(`Param` import from `../src`; `FakeLatent` already exists in this file.)

- [ ] **Step 2: Run** `pnpm --filter @audiorective/core test -- --run tests/engine-latency.browser.test.ts` — expect FAIL (stays 400).
- [ ] **Step 3: Implement** — in the `onSolve` wrapper: when the destination is not in the solve, `this._graphLatency.delete(token)` instead of retaining; then `_recomputeLatency()`. Decide membership without relying on the thrown internal error if the handle offers a cleaner check (e.g. a `has(node)`/snapshot); if you add such a method to `GraphHandle`, keep it minimal and note it. Update the nearby comment (present tense: a graph contributes only while it reaches the destination).
- [ ] **Step 4: Run** the file, then the full core suite + typecheck — PASS.
- [ ] **Step 5: Commit** `fix(core): engine latency ignores graphs that no longer reach the destination`.

---

### Task 2: Graph registry forgets removed processors and disposed graphs

**Files:**

- Modify: `packages/core/src/graph.ts` (`_graphRegistry` writes in `apply`; `dispose()`)
- Modify: `packages/core/src/AudioEngine.ts` only if `resolvePathLatency` needs the registry shape adjusted
- Test: `packages/core/tests/engine-latency.browser.test.ts`

**Interfaces:** `_graphRegistry: WeakMap<AudioProcessor, {...}>`; `getPathLatency` → `LatencyUnknownError`.

- [ ] **Step 1: Failing tests** — add three:

```ts
it("getPathLatency throws LatencyUnknownError after a conditional edge removes the processor", () => {
  const on = new Param<boolean>({ default: true });
  const engine = createEngine((ctx, { defineGraph }) => {
    const slow = new FakeLatent(ctx, 400);
    defineGraph(() => [on.value && [slow, ctx.destination]]);
    return { slow };
  });
  expect(engine.core.getPathLatency(engine.slow)).toBe(0);
  on.value = false;
  expect(() => engine.core.getPathLatency(engine.slow)).toThrow(LatencyUnknownError);
});

it("getPathLatency throws LatencyUnknownError after the owning graph is disposed", () => {
  let handle!: GraphHandle;
  const engine = createEngine((ctx, { defineGraph }) => {
    const slow = new FakeLatent(ctx, 400);
    handle = defineGraph(() => [[slow, ctx.destination]]);
    return { slow };
  });
  handle.dispose();
  expect(() => engine.core.getPathLatency(engine.slow)).toThrow(LatencyUnknownError);
});

it("getPathLatency throws LatencyUnknownError for a processor that only feeds an AudioParam", () => {
  const engine = createEngine((ctx, { defineGraph }) => {
    const lfo = new FakeLatent(ctx, 0);
    const carrier = new GainNode(ctx);
    defineGraph(() => [
      [lfo, carrier.gain],
      [carrier, ctx.destination],
    ]);
    return { lfo };
  });
  expect(() => engine.core.getPathLatency(engine.lfo)).toThrow(LatencyUnknownError);
});
```

(`GraphHandle` type import from `../src`.)

- [ ] **Step 2: Run** — expect FAIL (internal "node not present in the last solve" error, not `LatencyUnknownError`).
- [ ] **Step 3: Implement** — in `apply`, track the set of processors registered by THIS graph; after diffing, delete registry entries for processors no longer among the current edges' endpoints (only if the registry entry still points at this graph — another graph may own the processor now). In `dispose()`, delete every entry this graph registered. For the AudioParam-only case: a processor that appears only as the `from` of a param edge is not part of the solve; either don't register it, or make `resolvePathLatency` map the "not in last solve" condition to `LatencyUnknownError` — prefer not registering, and make `getPathLatency` translate any remaining `arrivalOf` miss into `LatencyUnknownError` as a backstop so the internal error can never escape through the public query.
- [ ] **Step 4: Run** file + full core suite + typecheck — PASS.
- [ ] **Step 5: Commit** `fix(core): graph registry forgets removed processors and disposed graphs`.

---

### Task 3: `measureLatency` destroys per-run processors

**Files:**

- Modify: `packages/devtools/src/measureLatency.ts`
- Test: `packages/devtools/tests/latency-validator.browser.test.ts`

- [ ] **Step 1: Failing test:**

```ts
it("destroys each processor it builds", async () => {
  const destroyed: number[] = [];
  await measureLatency((ctx) => {
    const p = latent(64, 64)(ctx);
    const original = p.destroy.bind(p);
    p.destroy = () => {
      destroyed.push(ctx.sampleRate);
      original();
    };
    return p;
  });
  expect(destroyed).toEqual([44100, 48000]);
});
```

- [ ] **Step 2: Run** `pnpm --filter @audiorective/devtools test -- --run` — expect FAIL (empty array).
- [ ] **Step 3: Implement** — wrap each per-rate render in `try { … } finally { proc.destroy(); }` in `measureLatencyDetailed` (after `startRendering()` resolves or throws). Keep the report shape unchanged.
- [ ] **Step 4: Run** devtools suite + typecheck — PASS (rebuild core first if Tasks 1–2 changed core: `pnpm --filter @audiorective/core build`).
- [ ] **Step 5: Changelog + commit** — add `### Fixed` under `[Unreleased]` in `CHANGELOG.md` covering all three fixes; commit `fix(devtools): destroy processors built for each measurement run`.
