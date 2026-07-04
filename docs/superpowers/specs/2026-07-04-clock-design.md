# @audiorective/clock: anchor + curve + loop — design spec

Date: 2026-07-04
Package: `@audiorective/clock` (new)
Builds on: Notion "LLM Knowledge Hub → Audiorective → @audiorective/clock"
(last edited 2026-03-09); supersedes it where they differ.

## Context & motivation

Audiorective has no timing engine. `docs/architecture.md` currently tells users
that "transport logic (start, stop, scheduling loops)" belongs in their own
`AudioProcessor` subclasses — i.e. every app hand-rolls its own scheduling.
Vibe-coded sequencers do this with `setTimeout` loops and fragile callback
teardown, and break in exactly the ways the March design doc catalogued.

`@audiorective/clock` is the temporal pillar of the system: **one clock, one
tick, one source of truth for time.** It is _not_ an `AudioProcessor` — it owns
no audio nodes and produces no signal. It is the other axis: `core` answers
"what sounds and how," `clock` answers "when."

Guiding principle carried over from the March doc: the clock provides timing
but does not own musical state. Params/Cells own state; the clock provides
timing windows.

### The mental model: a buffer, one level up

Web Audio's render quantum asks "fill the next 128 samples." The clock asks
"**commit the next ~100 ms of musical events**." Same inversion of control:
consumers never ask "what is now?" — they answer "what falls in this window?"
(This is the canonical look-ahead pattern from Chris Wilson's _A Tale of Two
Clocks_: JS timers jitter 10–50 ms; Web Audio scheduling is sample-accurate;
so schedule ahead against `AudioContext` time and a late JS tick can't move
audio that's already committed.)

## The core is three things

The clock core owns exactly three pieces of state. **Beat position is not one
of them — beat is derived.**

1. **The audio clock** — `ctx.currentTime`. Borrowed, never owned.
2. **A transport anchor** — `{ beatAtAnchor, timeAtAnchor }` plus the state
   flag, rewritten on every transport event:
   - `start()` → `{ 0, now }`
   - `pause()` → freeze current beat
   - `resume()` → `{ frozenBeat, now }`
   - `stop()` → `{ 0, — }` (reset)
   - (V3) `seek(beat)` → `{ targetBeat, now }` — seek is nothing new, just an
     anchor write.
3. **The speed curve** — a `TempoParam` event list (see below). Constant tempo
   is the one-segment case.

Everything else is a pure function of `(anchor, curve, now)`:

```
beat(t)       = beatAtAnchor + ∫[timeAtAnchor → t] bpm(τ)/60 dτ   (while playing)
beatToTime(b) = inverse of the same integral
window        = beats [previousWindowEnd → beat(now + lookAhead))
missed        = audio time already past the previous window's end
```

The only remaining state is scheduler plumbing: `lookAhead`, `tickInterval`,
the worker timer, and `previousWindowEnd` (which serves both the non-overlap
contract and miss detection).

Two properties fall out of this shape:

- **No drift by construction.** Beat is recomputed from the anchor every tick,
  never incrementally accumulated. No floating-point error compounding over an
  hour-long session; a late tick only shrinks or gaps the window (which miss
  detection reports), it cannot corrupt position.
- **Deterministic and headless-testable.** Feed a fake `currentTime` and every
  window, conversion, and miss is exactly reproducible with no timers and no
  `AudioContext` — per the repo's "headless core first, runs in a browser-mode
  unit test" doctrine.

## Timing model: the beat axis is the only native coordinate

The March doc carried an Ableton-Link-style trio (beat / phase / quantum).
This spec reduces it: `phase = beat % quantum` is a _reading_ of the beat
axis, exactly like `bar.number`. So:

> The clock's only native coordinate is the **beat axis** — a monotonic float
> driven by the tempo curve against the audio clock. Every other reading —
> bars, cycles/phase, seconds, swing, polyrhythm — is a **ruler**.

All positions are plain floats. No string notation (`"4n"`, `"1:2:3"`).

## One time unit: absolute audio-clock seconds

**Everything schedulable takes absolute `AudioContext` time.** No parallel
time base, no per-API ambiguity. The clock's headline feature is _conversion_:
you convert desired musical positions to absolute time, then schedule.

```ts
clock.bpm.setValueAtTime(140, timeline.beatToTime(64));
sampler.trigger({ time: timeline.beatToTime(nextBarBeat) }); // same unit everywhere
```

Two consequences, accepted with eyes open:

- **Scheduling "at beat 64" is convert-then-schedule, and it is
  self-consistent** for append-only scheduling: a tempo event at time T only
  affects beats _after_ T, so `beatToTime(64)` computed from the current map
  stays correct once the event lands exactly there. Retroactively inserting a
  tempo event _before_ already-scheduled future events (which would silently
  shift their beat positions) is out of scope until the V3 editable tempo map.
- **Scheduled events live on the audio clock, not the transport.** Absolute
  time keeps running while paused, so a tempo ramp scheduled into a window
  where you pause will have elapsed by resume — exactly how Web Audio treats
  `AudioParam`s. Same spirit as "gone is gone."

Config durations (`lookAhead`, `tickInterval`) are also seconds, for the same
one-unit reason. Defaults: `lookAhead: 0.1`, `tickInterval: 0.025` → 75 ms
overlap safety margin. Tick source: Web-Worker-based timer so ticks continue
in background tabs.

## TempoParam: standalone, event-list-backed

`clock.bpm` (exposed via `timeline.bpm`) mirrors the `SchedulableParam`
scheduling API but is a **standalone class in `@audiorective/clock`**, not a
reuse of core's `SchedulableParam`. Rationale, from a member-by-member audit:

- Core's `SchedulableParam` is hard-wired to an `AudioParam`: every scheduling
  method is a one-line delegation, and read-back is `ParamSync` polling. There
  is no implementation to share — only method names.
- The Timeline needs to _evaluate and integrate_ the tempo curve analytically
  (`beatToTime` is an integral). Web Audio gives no way to ask an `AudioParam`
  "what will your value be at time T?", so a hidden-AudioParam backing is a
  dead end. The curve must live in JS as an event list.
- TypeScript is structural: code written against "has
  `setValueAtTime(value, time)`" accepts both classes with zero shared
  declarations. If a second event-list consumer appears later (automating
  arbitrary plain `Param`s), promote the curve into core then — rule of three.

What is reused vs. new:

| From `@audiorective/core`            | Not applicable                          | New in clock                        |
| ------------------------------------ | --------------------------------------- | ----------------------------------- |
| `Param<number>` base (signal, `.value`, label/min/max, `bind`) | `ParamSync` (tick pushes value instead) | sorted event list                   |
| `ParamOptions` types                 | `rebind()` (one-shot-node workaround)    | `valueAtTime(t)` analytic evaluation |
|                                      | `read()` / `syncFromAudio()`             | piecewise integration for `beatToTime` |
|                                      |                                          | validation (`bpm > 0`)               |

API surface:

- `setValueAtTime(value, time)`
- `linearRampToValueAtTime(value, endTime)`
- `exponentialRampToValueAtTime(value, endTime)`
- `cancelScheduledValues(time)` / `cancelAndHoldAtTime(time)`
- `valueAtTime(time)` — query the curve (this is the capability the
  AudioParam-backed sibling can never have)
- **No `setTargetAtTime`** for tempo: asymptotic (never lands), ugly integral,
  no DAW precedent.

Semantics:

- `.value = x` ≡ `setValueAtTime(x, now)` — a step, leaving future events
  intact. More predictable than `AudioParam`'s quirky direct-set behavior.
- `.value` reads the signal, which the clock's own tick refreshes by
  evaluating the curve at `now` — so `useValue(timeline.bpm)` updates in every
  binding with no rAF polling and no `ParamSync`.

Integration math is closed-form per segment: piecewise-constant → linear
beat growth; linear ramp → quadratic; exponential ramp → analytic. The
second-anchored storage chosen above is the _easy_ direction
(`beat(t) = ∫ bpm/60 dτ` directly; beat-anchored storage would have needed the
inverted integral).

## Architecture: Clock / Timeline / Rulers

### Timeline — the time↔beat mapping

Owns the anchor + tempo curve, i.e. the mapping itself. Conversions are valid
even while paused or before the loop starts.

- `bpm: TempoParam`
- `beatToTime(beat): number` / `timeToBeat(time): number`
- convenience conversions that all return absolute time (shapes TBD in
  implementation): next-grid-point / quantize helpers per ruler
- `addRuler(key, ruler)` — returns the Timeline with the ruler's reading type
  accumulated (see typing below)

### Clock — the loop and the transport

Consumes a Timeline. Owns the worker-timer tick loop and the transport
methods, which write the Timeline's anchor.

- Constructor: `{ timeline, lookAhead = 0.1, tickInterval = 0.025, onTick, onMiss? }`
- `start()` / `pause()` / `stop()` (stop resets position)
- Transport state exposed as a readable `Param` so `useValue(clock.state)`
  works in every binding.

### TickWindow — the callback payload

Non-overlapping windows; each tick hands beats never handed before; schedule
them once. The window carries **both coordinates pre-converted** so consumers
do no conversion arithmetic in the hot path.

- `time` — `started`, `current`, `lookAheadEnd` (absolute audio-clock seconds)
- `beat` — `start`, `end` (window range on the beat axis)
- `transport` — `state`, `position` (pause-aware seconds since start)
- `missed?` — `{ gapStart, gapEnd, gapDuration }`; only present when a gap
  occurred. The clock reports and continues. It does not recover: Web Audio
  cannot schedule into the past. Gone is gone. Remedy: raise `lookAhead`.
- `rulers` — readings from registered rulers; **starts empty**, see below.
- `contains(time)` / dev-mode `assertInWindow(time)` — coordinate-agnostic
  validation for hand-computed times (see window contract).

### Rulers — window-scoped coordinate readers

A ruler interprets the beat axis into another coordinate system. The March doc
had rulers as pure data producers; this spec extends them to **window-scoped
readings** that mix data fields with query methods:

```ts
interface Ruler<R> {
  read(window: CoreTickWindow, timeline: Timeline): R;
}
```

A reading's methods close over the window bounds — so an iterator built from
the window's beat range structurally cannot emit an out-of-window time.

**No ruler is registered by default.** `window.rulers` starts as `{}`. Built-ins
ship as opt-in exports:

- `BarRuler({ numerator, denominator })` → `{ number, beatInBar, numerator,
  denominator, grid(division) }`
- `CycleRuler({ quantum })` → `{ cycle, phase, grid(division) }` — the former
  core phase/quantum, demoted to a reading
- `TimeRuler()` → `{ seconds }` (absolute seconds since playback start)

Zero defaults pays for itself: the `TickWindow` generic-typing problem the
March doc flagged as unsolved mostly dissolves (`rulers` is exactly what you
registered — an accumulating `addRuler(key, ruler)` signature, no
special-cased built-in keys), and tree-shaking is honest. The accepted cost:
there is no zero-config grid — even "hello metronome" registers a ruler first.
One explicit line, and the line tells you which coordinate system your grid
lives in. Matches the repo's taste (`param()` over decorators, explicit
`.value`, no magic).

Custom rulers are the extension mechanism, and two former "open problems"
become examples:

- **Polyrhythm** — a ruler whose `grid()` emits points at a different tempo
  relationship. One scheduling loop, N musical grids. (No second clock:
  multiple independent clocks remain a non-goal — a second loop means a second
  source of temporal truth and the exact fragmentation this package exists to
  eliminate.)
- **Swing** — a ruler whose `grid()` emits time-shifted grid points. The clock
  has no special swing support anywhere.

### Grid iteration — the primary idiom

```ts
const timeline = new Timeline({ audioContext: ctx, bpm: 120 })
  .addRuler("bar", new BarRuler({ numerator: 4, denominator: 4 }));

const clock = new Clock({
  timeline,
  onTick(window) {
    for (const { time, index } of window.rulers.bar.grid(16)) {
      if (pattern[index % 16]) sampler.trigger({ time });
    }
  },
});
clock.start();
```

`grid(division)` yields `{ beat, time, index }` for each grid point inside the
window — absolute time pre-converted, `index` a global step counter since
transport start. Each ruler defines its own division semantics (BarRuler:
steps per bar; CycleRuler: steps per cycle); exact signatures are an
implementation detail.

## The window contract and its enforcement

Contract: schedule only inside `[window start, window end)` — not later, not
earlier. Violations are **not Web Audio errors**: scheduling past the window
end works fine _now_ and double-fires one tick later (the next window covers
those beats again); scheduling before the start silently clamps to "now" and
produces timing slop. Silent misbehavior — the vibe-coded fragility class.

A hard guard is unenforceable anyway: consumers hold real references
(samplers, `AudioParam`s, the `AudioContext` itself); any wrapper is opt-in.
So enforcement is layered, making the right thing the easiest thing:

1. **Affordances** — `ruler.grid(...)` iteration and pre-converted window
   ranges; the majority sequencer/arpeggiator/metronome case never computes a
   raw time, so the contract holds structurally.
2. **Opt-in dev-mode validation** — `window.contains(time)` /
   `window.assertInWindow(time)` for hand-computed times (one-shots, manual
   offsets); loud in development, free in production.
3. **Convention in the skill** — the audiorective skill gains a clock section:
   "always iterate `grid()`; validate hand-computed times with `contains()`."
   Unusually effective in this repo, where the entity writing most `onTick`
   callbacks may be an LLM following `skills/`.

A mandatory guard-wrapper (all scheduling through `window.schedule(...)`) is
rejected: it cannot actually enforce anything, adds ceremony to every call,
and fights the audience — engineers who understand DSP and want clean
primitives, not a sandbox.

## Non-goals

- **Multiple clocks.** Unchanged stance. Rich window + rulers cover the use
  cases (metronome, secondary loop, subdivision, polyrhythm-as-ruler).
- **Syncing `FilePlayer`.** It runs on the media clock and cannot sample-lock
  to ctx-clocked sources; the clock governs ctx-clocked sources
  (`BufferPlayer`, `Sampler`, synths). See `docs/choosing-playback.md`.
- **Ableton Link network sync.** If it ever lands, a Link integration owns its
  quantum — nothing in core to fight.
- **Retroactive tempo-map editing** before V3.
- **String time notation.** Plain floats only.

## Roadmap

- **V1:** Clock + Timeline + anchor + event-list `TempoParam` limited to
  `setValueAtTime` (piecewise-constant → trivial integrals; constant tempo =
  one event). Non-overlapping windows, miss detection, `onTick`/`onMiss`,
  worker tick source. `BarRuler`, `CycleRuler`, `TimeRuler` as opt-in exports.
  `contains`/`assertInWindow`. Skill section.
- **V2:** unlock `linearRampToValueAtTime` / `exponentialRampToValueAtTime`
  (quadratic/analytic integrals). Because the event list exists from day one,
  V2 is "more segment types," not a rewrite — the March doc's V1/V2 split
  largely collapses.
- **V3:** `seek(beat)` (an anchor write) + DAW-style editable tempo map
  (beat-anchored storage internally; the absolute-time public API is
  unchanged). Possibly count-in/pre-roll (below).

## Stress test: four consumer archetypes

Findings from walking the design through four developer archetypes — step
sequencer, drum machine, DAW, rhythm game — recorded here first; the affected
sections above have **not** yet been amended. Overall: the two sequencer
archetypes fit the design as written; the DAW and rhythm game each expose one
genuinely missing capability, plus smaller cracks. Ranked by severity.

### ST-1. Looping is missing entirely (DAW: blocking; games: practice mode)

The beat axis is monotonic; a loop region means beat jumps backward. There is
no acceptable consumer-side workaround: with look-ahead, events _across_ the
loop boundary must be scheduled before the boundary arrives — the window
containing loop-end must hand out the tail of this pass **and** the head of
the next pass, both converted to correct absolute times, in one tick. So loop
cannot be "an anchor write when we get there"; the **window math must know the
loop region**. Step sequencers and drum machines escape (they loop via
`index % steps` over an infinite grid — no transport loop needed); a DAW loop
region and a rhythm game's practice loop both need it native.

Likely shape: a loop region on the transport, and a window whose beat range
can be **two spans** at the boundary (analogous to a ring-buffer wraparound
read). Needs its own design section. Real design work, not an amendment.

### ST-2. Windows need a discontinuity signal; `grid().index` semantics must survive it

Seek, stop→start, and every loop pass create a discontinuity in the beat
axis. Consumers hold derived state (step counters, "already scheduled note
i", arpeggio position) and currently have no way to know the axis jumped.
Also, `index` was specced as "global step counter since transport start" —
undefined after a seek to bar 33.

Resolution (cheap, decide now): a `discontinuity` marker (or generation
counter) on the window, and `index` redefined as **position-derived**
(`floor(beat / stepSize)`) so it is stable under seek and loop, rather than
"counted since start."

### ST-3. The visual/observation side is unspecced

Everything above serves the _scheduling_ direction. But a step sequencer
highlights the current step, a DAW draws a playhead, a rhythm game renders a
note highway — all need "**where is the audible now?**" at rAF rate. Three
sub-gaps:

- **Point queries.** `timeToBeat(ctx.currentTime)` exists, but ruler readings
  (bar number, phase) can only be computed for _windows_ — `read(window,
  timeline)` has no point form. Add a point-read; a window read is then the
  range case of the same operation.
- **Reactive position.** A coarse `clock.beat` `Param` pushed per tick
  (~40 Hz) for `useValue` UI, alongside the pull-based point query for
  rAF-driven canvases (the pixi/three bindings' home turf).
- **Audible now ≠ `ctx.currentTime`.** Sound exits the speakers
  `ctx.outputLatency` later; a playhead drawn at `currentTime` is visibly
  early on Bluetooth audio. Expose a latency-compensated now.

### ST-4. Rhythm games cross a clock domain at the input boundary

Judging a hit compares a **player input timestamp** (`performance.now()`
domain) against beat time (`AudioContext` domain). The domains must be
correlated (`ctx.getOutputTimestamp()`), and judgment must account for output
latency (score against what the player _heard_, not what was scheduled) plus
a user calibration offset. None of this contradicts the design — it is the
conversion feature extended one domain over — but without
`performanceTimeToBeat(t)` / latency-aware helpers, every game reinvents the
most error-prone part. (The scheduling direction already works: a beatmap
scheduled per-window via `beatToTime` is exactly the intended idiom.)
Candidate: one "clock domains & latency" section covering this and the third
bullet of ST-3.

### ST-5. The window contract is really an ownership contract

A drum machine with flams/humanize schedules `gridPointTime + 8 ms`, which
near the window edge lands _outside_ the window — yet is perfectly safe: it
can never double-fire, because ownership follows the **grid point**, which was
handed out exactly once. So `assertInWindow(finalTime)` as specced
false-positives on legitimate swing offsets and grace notes. The honest
contract is "**derive each event from data handed to you exactly once**,"
with window bounds as the proxy for the common case. Resolution: validate the
anchor (or allow a tolerance), and restate the contract section in ownership
terms.

### ST-6. Basic seek is deferred too far

Given the anchor design, seek is a two-field write. The V3 deferral is really
about seek under an _edited tempo map_ (second-anchored events go stale after
a jump) — but `clock.start({ atBeat })` / basic seek at constant tempo is
nearly free and wanted early by both the DAW and games (retry from
checkpoint). Proposed: pull basic seek into V1 with a documented
tempo-automation caveat; keep tempo-map-correct seek in V3.

### Minor notes

- `transport.isRecording` (present in the March doc) was dropped above —
  believed correctly (armed-ness is app state, a `Cell`; punch-in/out is
  window logic), but the drop should be explicit in the count-in open item
  rather than silent.
- Live pattern editing has an inherent ~`lookAhead` latency: toggling a step
  whose window was already committed takes effect next pass. Not fixable —
  document as an accepted property of look-ahead scheduling.

Disposition: ST-2, ST-5, and the point-query part of ST-3 are cheap spec
amendments; ST-1 needs a new design section (two-span windows); ST-4 plus the
latency part of ST-3 become one "clock domains & latency" section; ST-6 is a
roadmap reshuffle.

## Open questions

1. **Count-in / pre-roll lifecycle.** Carried over unresolved. Likely a
   declarative phase transition (count-in → armed → recording) the clock
   resolves at a ruler boundary; with transport state as a `Param` and rulers
   providing boundaries, the pieces exist, but the API shape is undecided.
2. **`addRuler` typing mechanics.** Accumulating-generic Timeline vs. builder;
   decide against real TS ergonomics during implementation.
3. **`grid()` exact signatures** and whether a shared nominal
   "schedulable-methods" interface is worth exporting from core (structural
   typing makes it optional).
4. **Where convenience conversions live** (`nextBarTime()` etc.) — Timeline
   vs. ruler readings vs. both.
