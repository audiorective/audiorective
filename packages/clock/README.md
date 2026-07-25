# @audiorective/clock

Timing and scheduling engine — transport, tempo, look-ahead tick windows, rulers. The temporal pillar of audiorective: `core` answers "what sounds and how," `clock` answers "when."

## Install

```bash
npm install @audiorective/clock
```

## The mental model

Web Audio's render quantum asks "fill the next 128 samples." The clock asks "commit the next ~100 ms of musical events." Same inversion of control: consumers never ask "what is now?" — they answer "what falls in this window?" (the canonical look-ahead pattern: JS timers jitter 10–50 ms, Web Audio scheduling is sample-accurate, so you schedule ahead against `AudioContext` time and a late JS tick can't move audio that's already committed).

Everything schedulable takes **absolute `AudioContext` time**. The clock's headline feature is conversion: you convert a musical position to a time, then schedule.

## Quick start — a metronome

```typescript
import { Clock, Timeline, LinearBarRuler } from "@audiorective/clock";

const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

const clock = new Clock({
  timeline,
  onTick(window) {
    for (const { time, index } of window.rulers.bar.grid(16)) {
      // `time` is already an absolute AudioContext time, which is what
      // core's Sampler takes as `when`
      if (pattern[index % 16]) sampler.trigger({ when: time });
    }
  },
});

clock.start();
```

`grid(division)` is the primary scheduling idiom: it yields only points inside the current window, pre-converted to absolute time. Deriving every event from a grid point handed to you exactly once means you never double-schedule — no manual window-bounds bookkeeping needed.

## Timeline — the beat↔time mapping

`Timeline` owns the transport anchor and the tempo curve — the only two pieces of stored position state in the whole package. Beat position is always _derived_, never accumulated, so there's no drift over a long session.

```typescript
timeline.beatToTime(64); // absolute AudioContext time for beat 64
timeline.timeToBeat(ctx.currentTime); // current beat position
timeline.bpm.setValueAtTime(140, timeline.beatToTime(64)); // tempo change scheduled at beat 64
```

`timeline.bpm` is a standalone, event-list-backed tempo curve (`TempoParam`) — not an `AudioParam`. It mirrors the Web Audio scheduling method names (`setValueAtTime`, `cancelScheduledValues`, `cancelAndHoldAtTime`) plus a `valueAtTime(t)` query the AudioParam-backed `SchedulableParam` in `@audiorective/core` can never support. V1 supports steps only; ramp methods throw (`linearRampToValueAtTime`/`exponentialRampToValueAtTime` are V2).

## Transport

```typescript
clock.start(); // or clock.start({ atBeat: 16 })
clock.pause(); // freezes position; committed look-ahead audio keeps sounding (an accepted tail)
clock.resume(); // continues from the frozen position
clock.stop(); // resets to beat 0
clock.seek(64); // jumps to beat 64
```

`clock.state` is a reactive `Param<"stopped" | "playing" | "paused">`.

Every jump (`seek`, `start({ atBeat })`, stop→start) bumps `window.generation` and begins a new continuity segment — windows are non-overlapping only _within_ a segment, so beats may legitimately reappear across a backward seek. Consumers holding derived state (step counters, generator positions) should reset when `generation` changes.

## Rulers — reading the beat axis

The clock's only native coordinate is the beat axis — a monotonic float driven by the tempo curve. Every other reading (bars, cycles, seconds, polyrhythm) is a **ruler**: a stateless interpreter registered on the Timeline.

```typescript
timeline.addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));
timeline.rulers.bar.current.value; // reactive point reading, refreshed every tick — for UI/visuals
```

Four built-ins, crossed along two axes — **unit** (bar vs. raw time) × **topology** (linear, counts forever / cycle, wraps):

|          | Linear                                       | Cycle                                                    |
| -------- | -------------------------------------------- | -------------------------------------------------------- |
| **Bar**  | `LinearBarRuler({ numerator, denominator })` | `CycleBarRuler({ numerator, denominator, bars, from? })` |
| **Time** | `LinearTimeRuler()`                          | `CycleTimeRuler({ seconds, from? })`                     |

`CycleBarRuler` is how **looping** is expressed: the beat axis never jumps — it's read modulo the cycle region, so scheduling across a loop boundary needs no special case. Its window reading exposes `spans` (the window's cycle-relative sub-ranges, for note content that isn't grid-snapped) alongside `grid()`.

Write a custom ruler for anything else (polyrhythm, swing) — implement `Ruler<TWindow, TPoint>`:

```typescript
interface Ruler<TWindow, TPoint> {
  read(window: CoreTickWindow, timeline: TimelineLike): TWindow; // window-scoped, grid()/spans close over its bounds
  at(beat: number, timeline: TimelineLike): TPoint; // point reading, feeds `current`
}
```

## Miss detection

If the clock fires late and audio time has moved past the previous window's end, those beats are gone — Web Audio cannot schedule into the past. The clock reports the gap via `onMiss` and continues; it does not try to recover.

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

## Tick sources

`Clock` defaults to `WorkerTickSource` (a Web-Worker timer, so ticks continue in background tabs). `IntervalTickSource` and `ManualTickSource` are also exported — the latter is how this package's own tests drive ticks deterministically without a real `AudioContext`.

## Design

See [`docs/superpowers/specs/2026-07-04-clock-design.md`](../../docs/superpowers/specs/2026-07-04-clock-design.md) in the monorepo root for the full design rationale.
