# Step Sequencer Demo App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/step-sequencer` — a 4-track × 16-step drum machine that is the canonical consumer demo for `@audiorective/clock` V1: `grid()` scheduling, reactive `current` playhead, live tempo, transport, live pattern editing, headless audio core.

**Architecture:** Headless `DrumMachine` (Timeline + Clock + 4 procedurally-synthesized `Sampler` tracks with `Cell` patterns and `Param` mutes) exposing only reactive surfaces and transport methods; React 19 UI as a thin observer via `useValue`. The entire scheduling logic is one `grid(16)` loop with `index % 16` — the clock docs' idiom, verbatim.

**Tech Stack:** React 19 + Vite (mirrors `apps/showroom`), `@audiorective/{core,clock,react}`, vitest browser mode (chromium, `fileParallelism: false`, the `PLAYWRIGHT_BROWSERS_PATH` executablePath workaround from `packages/clock/vitest.config.ts`).

**Spec:** `docs/superpowers/specs/2026-07-12-step-sequencer-demo-design.md` (the contract — read it first). Clock background: `docs/clock.md`.

**Branch:** `claude/clock-package-design-check-vwg7hc`. Run tests with `pnpm --filter @audiorective/step-sequencer test -- --run`. `@audiorective/clock` must be built (`pnpm --filter @audiorective/clock build`) before the app typechecks.

---

## File structure

```
apps/step-sequencer/
  package.json  tsconfig.json  vite.config.ts  vitest.config.ts  index.html
  src/
    main.tsx
    vite-env.d.ts
    audio/
      drumKit.ts        # procedural kick/snare/hat/clap -> AudioBuffer
      DrumMachine.ts    # headless core: Timeline+Clock+tracks, transport, reactive surface
      stepFromBar.ts    # floor(beatInBar * 4) helper shared by UI and tests
    ui/
      App.tsx           # owns the DrumMachine, ctx-resume gesture, layout
      TransportBar.tsx  # play/pause/stop, bpm slider, bar:beat readout
      StepGrid.tsx      # 4x16 toggle grid + playhead column + mutes
      styles.css
  tests/
    drumKit.test.ts  drumMachine.test.ts  smoke.test.ts
```

---

## Task 1: App scaffold

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/vite-env.d.ts`

- [ ] `package.json`: name `@audiorective/step-sequencer`, `private: true`, version `2.0.0`; scripts and devDependencies mirroring `apps/showroom` (minus playcanvas/three); dependencies: `@audiorective/core`, `@audiorective/clock`, `@audiorective/react` (all `workspace:*`), `alien-signals`, `react`, `react-dom`.
- [ ] `tsconfig.json`: copy showroom's. `vite.config.ts`: vite + `@vitejs/plugin-react`. `vitest.config.ts`: copy `packages/clock/vitest.config.ts` (browser mode + executablePath workaround).
- [ ] `index.html` + `src/main.tsx` rendering a placeholder `<App/>`; `pnpm install`; verify `pnpm --filter @audiorective/step-sequencer typecheck` and `build` pass.
- [ ] Commit.

## Task 2: Procedural drum kit

**Files:** `src/audio/drumKit.ts`, `tests/drumKit.test.ts`

- [ ] `createDrumKit(ctx): Promise<{ kick, snare, hat, clap }: Record<string, AudioBuffer>>`. Recipes (implementer freedom per spec, these are known-good starting points): kick = 150→45 Hz sine drop with exp amplitude decay (~0.35 s); snare = 180 Hz triangle body + bandpassed white noise (~0.2 s); hat = highpassed (>7 kHz) white noise, fast decay (~0.08 s); clap = 3 short noise bursts ~10 ms apart into a ~0.15 s tail. Direct `Float32Array` math into `ctx.createBuffer` is fine — no `OfflineAudioContext` needed unless it's simpler.
- [ ] Tests: each buffer is non-silent (peak > 0.1), correct-ish duration, no NaN, peak ≤ 1 (no clipping); kit creation is deterministic enough to not throw twice.
- [ ] Verify: `pnpm --filter @audiorective/step-sequencer test -- --run tests/drumKit.test.ts`. Commit.

## Task 3: DrumMachine headless core

**Files:** `src/audio/DrumMachine.ts`, `src/audio/stepFromBar.ts`, `tests/drumMachine.test.ts`

- [ ] `stepFromBar.ts`: `stepFromBar(point: { beatInBar: number }): number` = `Math.floor(point.beatInBar * 4) % 16` (clamped to 0..15). Exported for UI + tests.
- [ ] `DrumMachine`:
  - Constructor `{ audioContext, buffers, tickSource?, onStepScheduled? }`. Builds `Timeline({ audioContext, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }))`, one `Sampler` per track wired to `ctx.destination` through a shared master `GainNode`, and the `Clock` (forwarding `tickSource`).
  - Tracks: `kick`/`snare`/`hat`/`clap`, each `{ id, label, pattern: Cell<boolean[]>(16), mute: Param<boolean> }`. Default pattern: kick on 0/4/8/12, snare on 4/12, hat on 2/6/10/14, clap empty.
  - `onTick` exactly as written in the spec (grid(16), `index % 16`, mute + pattern gate, `sampler.trigger({ time })`, `onStepScheduled?.(trackId, step, time)`).
  - Surface: `bpm`, `state`, `currentBar` getters; `toggleStep(trackId, step)`; `play()` (resume when paused, else start), `pause()`, `stop()`; `destroy()` (clock destroy + samplers/gain teardown).
- [ ] Tests (deterministic — `ManualTickSource` + a plain `{ currentTime }` object advanced by hand, buffers from `createDrumKit`):
  - toggleStep flips exactly one step immutably; default pattern shape.
  - Drive one bar of windows: `onStepScheduled` fires exactly for on-steps, times strictly increasing; second bar wraps (`index % 16` — same steps fire again).
  - Muted track schedules nothing; unmute mid-run resumes on the next window.
  - Toggle a step off after its window was committed → it still fires once (assert the documented lookAhead latency).
  - `stop()` then `play()` restarts from step 0 (first scheduled step is 0).
- [ ] Verify file's tests green. Commit.

## Task 4: UI

**Files:** `src/ui/App.tsx`, `src/ui/TransportBar.tsx`, `src/ui/StepGrid.tsx`, `src/ui/styles.css`, finalize `src/main.tsx`

- [ ] `App`: lazily create `AudioContext` + `createDrumKit` + `DrumMachine` on first user gesture (a "power on" overlay button — also satisfies autoplay policy); `machine.destroy()` + `ctx.close()` on unmount; layout = TransportBar over StepGrid.
- [ ] `TransportBar`: `useValue(machine.state)` drives play/pause button label + stop disabled state; bpm slider (40–220) reading `useValue(machine.bpm)` and writing `machine.bpm.value`; `bar : beat` readout from `useValue(machine.currentBar)` (`bar + 1`, `floor(beatInBar) + 1`).
- [ ] `StepGrid`: rows from `machine.tracks`; per-row `useValue(track.pattern)` + `useValue(track.mute)`; cell click → `machine.toggleStep`; playhead column = `stepFromBar(useValue(machine.currentBar))` when state is `playing`; every-4th-column grouping accent per spec. Dark minimal CSS.
- [ ] Verify: typecheck + `pnpm --filter @audiorective/step-sequencer build`; then actually run it (`pnpm --filter @audiorective/step-sequencer dev` + Playwright against the dev server): power on, press play, assert the playhead column advances and no console errors; toggle a step and a mute. This is the app working, not just compiling.
- [ ] Commit.

## Task 5: Smoke test, docs touch, final verify

**Files:** `tests/smoke.test.ts`, `apps/step-sequencer/README.md`, root `CHANGELOG.md`

- [ ] `smoke.test.ts`: real `WorkerTickSource` (no injected source), bpm 240, run ~1 bar with the default pattern; assert `onStepScheduled` collected the expected kick steps in order and times are strictly increasing. Poll, don't sleep (showroom convention).
- [ ] `README.md`: what it demonstrates (the spec's six-point list, condensed), how to run, pointer to `docs/clock.md` and the two specs.
- [ ] `CHANGELOG.md` `[Unreleased]`: one entry — demo app added as the canonical clock consumer.
- [ ] Final verify: `pnpm -r build && pnpm -r typecheck`, full app test suite, full clock test suite (unchanged). Commit.

---

## Task order & commit points

Tasks are sequential, one commit each (`feat(step-sequencer): …`), heredoc commit messages. Task 3 is the correctness core — its deterministic scheduling tests are the app-level restatement of the clock's own guarantees; do not proceed past it with any skipped test. Task 4's "actually drive it in a browser" step is mandatory — a demo app that has never been run is not done.
