# @audiorective/clock

Timing and scheduling engine — transport, tempo, look-ahead tick windows, rulers. The temporal pillar of audiorective: `core` answers "what sounds and how," `clock` answers "when." It is not an `AudioProcessor` — it owns no audio nodes and produces no signal.

## The mental model

Web Audio's render quantum asks "fill the next 128 samples." The clock asks "commit the next ~100 ms of musical events." Same inversion of control: consumers never ask "what is now?" — they answer "what falls in this window?" JS timers jitter 10–50 ms (GC, layout, background throttling); Web Audio scheduling is sample-accurate. Schedule ahead against `AudioContext` time and a late JS tick can't move audio that's already committed.

## One time unit: absolute AudioContext time

Everything schedulable takes absolute `AudioContext` time — no parallel time base, no per-API ambiguity. The clock's headline feature is _conversion_: convert a musical position to a time, then schedule.

```typescript
timeline.bpm.setValueAtTime(140, timeline.beatToTime(64));
sampler.trigger({ when: timeline.beatToTime(nextBarBeat) }); // same unit everywhere
```

## Quick start — a metronome

```typescript
import { Clock, Timeline, LinearBarRuler } from "@audiorective/clock";

const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

const clock = new Clock({
  timeline,
  onTick(window) {
    for (const { time, index } of window.rulers.bar.grid(16)) {
      // `time` is absolute AudioContext time -- exactly what Sampler's `when` wants
      if (pattern[index % 16]) sampler.trigger({ when: time });
    }
  },
});

clock.start();
```

### Handing a grid point to a core player

The names differ across the package boundary, and that is the single easiest thing to get wrong here: the clock gives you **`time`**, core's players take **`when`**. Both are absolute `AudioContext` seconds, so the value passes straight through — only the key changes.

```typescript
for (const { time } of window.rulers.bar.grid(16)) {
  sampler.trigger({ when: time }); // Sampler / Voice
  bufferPlayer.start(time); // BufferPlayer takes it positionally
}
```

Writing `trigger({ time })` is the natural first draft and it does not compile — TypeScript rejects it (`'time' does not exist in type 'VoiceOptions'`). That error is the fix instruction: rename the key, don't reshape the call.

## The window convention

**Derive each event from data the window hands you exactly once, and you will never double-schedule.** Grid iteration (`ruler.grid(division)`) does this automatically — it's the primary idiom and covers the large majority of sequencer/arpeggiator/metronome code.

The convention is not enforced by the clock — there's no validation API, no guard wrapper. Scheduling outside the current window is permitted, and is sometimes exactly right: a grace-note or humanize offset computed from an in-window grid point (`gridPointTime + 8ms`) may land past the window edge, and that's still safe, because ownership follows the grid point, which was handed out exactly once. What breaks the contract is deriving an event from something _other_ than data the current window gave you — recomputing a position from scratch, or reusing a beat range across ticks.

If you're an LLM writing an `onTick` callback: always iterate `grid()`/`spans()` rather than hand-computing beat positions, and you get the non-overlap guarantee for free.

## Timeline — the beat↔time mapping

`Timeline` owns the transport anchor and the tempo curve — the only two pieces of stored position state in the package. Beat position is always _derived_, never accumulated, so there's no drift over a long session.

```typescript
timeline.beatToTime(64); // absolute AudioContext time for beat 64
timeline.timeToBeat(ctx.currentTime); // current beat position
```

`timeline.bpm` is a standalone, event-list-backed tempo curve (`TempoParam`) — not an `AudioParam`. It mirrors the Web Audio scheduling method names (`setValueAtTime`, `cancelScheduledValues`, `cancelAndHoldAtTime`) plus a `valueAtTime(t)` query the AudioParam-backed `SchedulableParam` in `@audiorective/core` can never support (Web Audio gives no way to ask an `AudioParam` "what will your value be at time T?"). V1 supports steps only; ramp methods throw (`linearRampToValueAtTime`/`exponentialRampToValueAtTime` are V2).

**What "beat" means:** the axis unit is defined by the tempo curve and nothing else — `bpm` is axis-units per minute, so the unit is literally the B in BPM. It carries no time signature, no bars, no downbeat; it's musically meaningless on its own (like MIDI's quarter-note-normalized ppq ticks) until a ruler interprets it. This is Ableton Link's convention: a float beat plus a bpm, "beat = quarter note" by shared convention.

## Transport

```typescript
clock.start(); // or clock.start({ atBeat: 16 })
clock.pause(); // freezes position; committed look-ahead audio keeps sounding (an accepted tail, ~lookAhead seconds)
clock.resume(); // continues from the frozen position, no re-scheduling
clock.stop(); // resets to beat 0
clock.seek(64); // jumps to beat 64
```

`pause()` and `resume()` are each a no-op unless the transport is in the state
they act on — only a playing clock pauses, only a paused clock resumes. So
`start()` is the sole entry into playback, and a stray `pause()`/`resume()`
pair on a stopped clock leaves it stopped rather than starting it mid-segment.

`clock.state` is a reactive `Param<"stopped" | "playing" | "paused">`.

Every jump (`seek`, `start({ atBeat })`, stop→start) bumps `window.generation` and begins a new continuity segment — windows are non-overlapping only _within_ a segment, so beats may legitimately reappear across a backward seek. Consumers holding derived state (step counters, generator positions) should reset when `generation` changes.

Pausing does not cancel already-committed audio: up to `lookAhead` seconds of scheduled events keep sounding after `pause()`. This is an accepted tail, consistent with how DAWs behave — the clock neither owns nor cancels scheduled events; consumers who genuinely need a hard stop cancel the voices they own.

## Rulers — reading the beat axis

The clock's only native coordinate is the beat axis — a monotonic float driven by the tempo curve. Every other reading (bars, cycles, seconds, polyrhythm, swing) is a **ruler**: a stateless interpreter registered on the Timeline. Rulers hold no position state — every reading is a pure function of the beat position passed in, so pause/seek/loop cost a ruler nothing.

```typescript
timeline.addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));
timeline.rulers.bar.current.value; // reactive point reading, refreshed every tick -- for UI/visuals
```

`current` is the visual-sync surface: a step sequencer lights its current step, a DAW draws its playhead, from the `current` of the ruler that represents the timeline the app is showing.

Four built-ins, crossed along two axes — **unit** (bar vs. raw time) × **topology** (linear, counts forever / cycle, wraps):

|          | Linear                                       | Cycle                                                    |
| -------- | -------------------------------------------- | -------------------------------------------------------- |
| **Bar**  | `LinearBarRuler({ numerator, denominator })` | `CycleBarRuler({ numerator, denominator, bars, from? })` |
| **Time** | `LinearTimeRuler()`                          | `CycleTimeRuler({ seconds, from? })`                     |

**Looping is a `CycleBarRuler` reading, not transport state.** The beat axis never jumps — a loop region `[from, from + bars*beatsPerBar)` is read modulo its length, so scheduling across the loop boundary needs no special case: `grid()` emits points from both sides of the wrap at their correct axis positions, converting to strictly increasing absolute times. The window reading also exposes `spans` — the window's cycle-relative sub-ranges, each with its own conversion back to absolute time — for note content that isn't grid-snapped (the same cycle position converts to a different absolute time on each pass).

### Linear grids count; cycle grids fold

The two kinds of ruler yield different grid points, and the difference is the whole reason to pick one over the other:

| Ruler            | Grid point                               | `division` means    |
| ---------------- | ---------------------------------------- | ------------------- |
| `LinearBarRuler` | `{ beat, time, index }` — counts forever | steps per **bar**   |
| `CycleBarRuler`  | `{ beat, time, step, cycle }`            | steps per **cycle** |

Pass a pattern's length as `division` on a cycle ruler and `step` indexes that pattern directly — the cycle region holds exactly one pass, so no `% length` is needed at the call site:

```typescript
for (const { time, step } of window.rulers.pattern.grid(steps.length)) {
  if (steps[step]) sampler.trigger({ when: time });
}
```

`cycle` is per grid point, not per window: a window can straddle the wrap, so points within one callback may belong to different passes. The global count is still recoverable as `cycle * division + step`.

The fold uses floored division rather than `%`. JavaScript's remainder keeps the sign of the dividend, so a hand-written `index % 16` returns `-1` for the step before the origin and reads off the front of a pattern array — reachable, since `seek()` accepts negative beats and `from` may be positive.

**Swing and per-note micro-timing are deliberately not a ruler concern.** They're a transformation of event placement, which is note-content territory — future work for a track/clip primitive that consumes the clock, not something the clock itself models.

Write a custom ruler for anything else (e.g. polyrhythm — one scheduling loop, a different musical grid) by implementing `Ruler<TWindow, TPoint>`:

```typescript
interface Ruler<TWindow, TPoint> {
  read(window: CoreTickWindow, timeline: TimelineLike): TWindow; // window-scoped; grid()/spans close over its bounds
  at(beat: number, timeline: TimelineLike): TPoint; // point reading, feeds `current`
}
```

## Miss detection

If the clock fires late and audio time has moved past the previous window's end, those beats are gone — Web Audio cannot schedule into the past. The clock reports the gap via `onMiss` and continues; it does not try to recover. Gone is gone.

```typescript
new Clock({
  timeline,
  onTick /* ... */,
  onMiss(gap) {
    console.warn(`missed ${gap.gapDuration}s`, gap);
  },
});
```

Remedy: raise `lookAhead`.

A freshly-started or freshly-seeked segment's very first tick is exempt from this check — there's no prior emitted window in the new segment to have fallen behind, so comparing against one would be a false positive on every single transport start.

## Live pattern editing

Toggling a step whose window has already been committed takes effect on the _next_ pass, not immediately — an inherent ~`lookAhead` latency. This is an accepted property of look-ahead scheduling, not a bug to work around.

## Tick sources

`Clock` defaults to `WorkerTickSource` (a Web-Worker timer, so ticks continue in background tabs). `IntervalTickSource` (setInterval fallback) and `ManualTickSource` (deterministic, hand-driven ticks — how this package's own tests work without a real `AudioContext`) are also exported.

## Testing scheduling deterministically

The repo's rule is that audio logic runs in a unit test with no DOM. For time, that needs **two** injections, and they are separate parameters on purpose:

- `tickSource: new ManualTickSource()` — ticks fire only when the test calls `tick()`.
- `audioContext: { currentTime }` — a plain object the test advances by hand. `Timeline` only ever reads `currentTime`, so it accepts any object with that property.

```typescript
const fakeClock = { currentTime: 0 };
const tickSource = new ManualTickSource();
const timeline = new Timeline({ audioContext: fakeClock, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));
const clock = new Clock({ timeline, tickSource, onTick: (w) => collect(w) });

clock.start();
for (let t = 0; t <= 1.85; t += 0.05) {
  fakeClock.currentTime = t; // "now" moves only here
  tickSource.tick(); // windows are emitted only here
}
```

Every assertion is then exact — no tolerances, no polling, no flake.

**Keep the fake clock separate from the audio context.** In an app that also builds real nodes, pass the real `AudioContext` to the players and the fake object to the `Timeline`; do not try to wrap one context in a `Proxy` that overrides `currentTime`. Web Audio constructors brand-check their context argument, so a proxied context fails with `Failed to construct 'GainNode': parameter 1 is not of type 'BaseAudioContext'`. `apps/step-sequencer`'s `DrumMachine` takes `audioContext` and an optional `timeSource` for exactly this reason.

Two things to remember when writing assertions:

- A window at `now` already covers `now + lookAhead`, so a loop ending at `t` has committed events up to `t + 0.1` with the defaults. Pick loop bounds accordingly, or you will "lose" a step you expected or gain one you didn't.
- Pair the deterministic tests with one real-`WorkerTickSource` smoke test, and poll for the data instead of sleeping a fixed duration.

## Non-goals

- **Multiple clocks.** One scheduling loop, one source of temporal truth — rich windows + rulers cover metronome/secondary-loop/polyrhythm use cases.
- **Syncing `FilePlayer`.** It runs on the media clock and cannot sample-lock to ctx-clocked sources; the clock governs ctx-clocked sources (`BufferPlayer`, `Sampler`, synths).
- **Note content and micro-timing** (swing, humanize, per-note offsets, scales) — future track/clip primitive territory.
- **String time notation.** Plain floats only.

## Design

See [`docs/superpowers/specs/2026-07-04-clock-design.md`](superpowers/specs/2026-07-04-clock-design.md) for the full design rationale, including the stress-test findings against step-sequencer/drum-machine/DAW/rhythm-game usage.
