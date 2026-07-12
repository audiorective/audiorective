# Step sequencer demo app — design spec

Date: 2026-07-12
App: `apps/step-sequencer` (new, private)
Depends on: `@audiorective/clock` (V1, this branch), `@audiorective/core`, `@audiorective/react`
Spec it demonstrates: `docs/superpowers/specs/2026-07-04-clock-design.md`

## Purpose

The canonical consumer of `@audiorective/clock` — the exact archetype the clock
design was stress-tested against. A 4-track × 16-step drum machine that shows,
in one screen, every V1 headline feature working together:

1. **`grid()` scheduling + `index % 16`** — the window convention's primary
   idiom, verbatim from the clock docs' quick-start.
2. **Reactive `current` as the visual-sync surface** — the playhead/step
   highlight reads `timeline.rulers.bar.current`, no rAF loop, no parallel
   position state.
3. **Live tempo change** — a bpm slider writing `timeline.bpm.value` while
   playing; the beat axis re-derives, nothing drifts.
4. **Transport** — play/pause/resume/stop wired to the clock, state badge via
   `useValue(clock.state)`. Pause→resume continues mid-bar with no
   re-scheduling; stop resets to step 0.
5. **Live pattern editing** — toggling steps while playing, including the
   documented ~`lookAhead` latency on a step whose window was already
   committed (an accepted property, shown honestly rather than hidden).
6. **The audio/UI doctrine** — a headless `DrumMachine` core that runs in a
   browser-mode unit test with no DOM; React as a thin observer.

It is also the repo's first real proof that the clock docs/skill teach the
right idioms: the app's `onTick` is exactly the code the skill tells an LLM to
write.

## Stack

React 19 + Vite, mirroring `apps/showroom`'s tooling (including vitest browser
mode for the headless audio tests). Dependencies: `@audiorective/core`,
`@audiorective/clock`, `@audiorective/react`, `alien-signals`. No binary
assets.

## Sound: procedural drum kit

Four voices — kick, snare, hat, clap — synthesized into `AudioBuffer`s at init
(sine-drop kick, filtered-noise snare/hat, multi-burst noise clap; plain
buffer math or `OfflineAudioContext`, implementer's choice). Each buffer feeds
a core `Sampler`. Rationale: zero assets keeps the demo self-contained and
deterministic, and `Sampler.trigger({ time })` is the intended pairing with
grid scheduling (polyphonic pad, fire-and-forget, absolute-time trigger).

## Architecture

### `DrumMachine` — the headless audio core (`src/audio/DrumMachine.ts`)

Owns everything temporal and audible. Litmus: runs in a browser-mode unit test
with no DOM.

- **Timeline + Clock**: `Timeline({ audioContext, bpm: 120 })` with a
  `LinearBarRuler({ numerator: 4, denominator: 4 })` registered as `"bar"`;
  one `Clock` with the default look-ahead. The clock is constructed in the
  `DrumMachine` constructor and destroyed in `destroy()`.
- **Tracks**: fixed array of 4 — `{ id, label, sampler, pattern, mute }`.
  - `pattern: Cell<boolean[]>` (16 steps) — structured state, per the
    Cell-vs-Param doctrine. `toggleStep(trackId, step)` uses the Cell's
    immutable update.
  - `mute: Param<boolean>` per track.
- **Scheduling** — the whole tick handler, and deliberately nothing more:

  ```ts
  onTick: (window) => {
    for (const { time, index } of window.rulers.bar.grid(16)) {
      const step = index % 16;
      for (const track of this.tracks) {
        if (!track.mute.value && track.pattern.value[step]) {
          track.sampler.trigger({ time });
        }
      }
    }
  };
  ```

  One bar of 4/4 = 16 sixteenths, so `grid(16)` (steps **per bar**) at step
  size 0.25 beats and `index % 16` give the pattern lookup. No cursors, no
  window-bounds bookkeeping, nothing to reset on transport jumps —
  position-derived `index` is the point.

- **Exposed reactive surface** (what the UI observes):
  - `bpm` → `timeline.bpm` (a `Param<number>`; slider binds `.value`)
  - `state` → `clock.state`
  - `currentBar` → `timeline.rulers.bar.current` (a `Param<LinearBarPoint>`;
    the UI derives the lit step as `floor(beatInBar * 4)` and displays
    `bar : beat` position from the same reading)
  - per-track `pattern` cells and `mute` params
- **Transport**: `play()` (resume if paused, else start), `pause()`, `stop()`
  — thin delegation to the clock. No other audio methods leak to the UI.
- **Test hook**: constructor accepts an optional `tickSource` (forwarded to
  the Clock) and an optional `onStepScheduled(trackId, step, time)` callback
  fired alongside each `trigger`, so headless tests can drive ticks with
  `ManualTickSource` + a fake-advanced context and assert exact scheduling
  without inspecting Web Audio internals.

### UI (`src/ui/`) — thin observer, React 19

- **`App`** — owns the `DrumMachine` instance (created once, destroyed on
  unmount) and the AudioContext-resume-on-first-gesture handshake.
- **`TransportBar`** — play/pause/stop buttons (labels/disabled state from
  `useValue(machine.state)`), bpm slider + numeric readout bound to
  `machine.bpm.value` (range ~40–220), and a `bar : beat` position readout
  from `useValue(machine.currentBar)`.
- **`StepGrid`** — 4 rows × 16 columns of toggle buttons reading each track's
  `useValue(pattern)`; column highlight where `floor(beatInBar * 4)` matches
  and state is `playing`; per-track label + mute toggle. Beats 1/5/9/13 get a
  subtle visual grouping (every 4th column) so the bar structure reads at a
  glance.
- Plain CSS (one stylesheet), dark, minimal — this is a primitives demo, not
  a design showcase.

A default pattern ships pre-loaded (four-on-the-floor kick, backbeat snare,
offbeat hats) so pressing play immediately makes the demo legible.

## What this app deliberately does NOT do

Scope cuts, each with the reason recorded:

- **No swing / velocity / per-note offsets** — note-content territory,
  reserved for the future track/clip primitive (clock spec non-goal). The
  demo must not teach a workaround.
- **No pattern save/load, no pattern chaining** — app-state features that add
  nothing about the clock.
- **No seek UI** — `stop` + `play` covers the demo's needs; a scrub bar
  belongs to a DAW-shaped demo.
- **No `CycleBarRuler`/looping demo** — the 16-step pattern loops via
  `index % 16` over the infinite grid, which is itself the documented
  sequencer idiom (spec ST-1: "step sequencers escape — no transport loop
  needed"). Showing that clearly is more valuable than bolting on a loop
  region this app doesn't need.
- **No tempo ramps** — V1 `TempoParam` is steps-only; the slider demonstrates
  live steps, and that's honest to what shipped.

## Testing

Headless, vitest browser mode (real `AudioContext`, no DOM), following the
showroom test conventions plus the clock package's deterministic harness:

1. **Pattern/state logic** — toggle, mute, default pattern shape (pure Cell
   assertions, no clock involvement).
2. **Scheduling correctness (deterministic)** — `ManualTickSource` + a
   fake-advanced context driving the machine's clock; assert via
   `onStepScheduled` that exactly the toggled-on steps fire, `index % 16`
   wraps across bars, muted tracks stay silent, and a step toggled off after
   its window was committed still fires once (the documented lookAhead
   latency — asserted, not apologized for).
3. **Smoke (real timers)** — default `WorkerTickSource`, run ~a bar at high
   bpm, assert triggers arrived and no misses; mirrors the clock package's
   integration test shape.

## Open (small) implementation choices

Left to the implementer, none design-significant: exact drum synthesis
recipes; whether `currentBar`-derived step lives in a tiny exported helper
(`stepFromBar(point): number`) shared by UI and tests (recommended: yes);
slider styling.
