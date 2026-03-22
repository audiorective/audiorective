# @audiorective/clock

Timing and scheduling engine. Replaces Tone.js Transport with a cleaner, single-loop paradigm.

## Dependencies

```json
{
  "peerDependencies": {
    "@audiorective/signals": "workspace:*"
  }
}
```

---

## Philosophy

One clock, one tick callback, non-overlapping windows. The clock provides timing — it doesn't own state. Your signals own state; the tick callback reads them and schedules audio.

---

## Timing Model (Ableton Link Style)

Three concepts:

- **Beat** — absolute position since start (float: 0.0, 1.0, 4.5, 127.25...)
- **Phase** — position within current cycle (0.0 to quantum, then wraps)
- **Quantum** — cycle length in beats (e.g. 4 for one bar in 4/4)

No `"4n"` notation. No `"1:2:3"` format. Just beats.

---

## Look-Ahead Scheduling

JavaScript timing is imprecise. Web Audio scheduling is sample-accurate.

The clock doesn't ask "what plays now?" It asks "what plays in the next N milliseconds?" You schedule those events with Web Audio timing. If JS is late, the audio is still on time.

```
|-------- look-ahead window --------|
past ----[current]---------------[lookAheadEnd]---- future
              ↑                        ↑
         callback fires          schedule up to here
```

### Window Contract

Non-overlapping windows. Each tick gives you beats that haven't been given before. Schedule them once.

```
Tick 1: beats 0.0 → 0.5
Tick 2: beats 0.5 → 1.0
Tick 3: beats 1.0 → 1.5
```

### Miss Detection

If the clock fires late and audio time has moved past the previous window end, a gap occurred. Those beats are gone — Web Audio can't schedule into the past.

The clock reports the miss and continues. It doesn't pretend to recover.

---

## Timeline Class

Handles beat ↔ time conversion. V1 is constant tempo. Designed for future extension to tempo maps.

**Properties:**

- `tempo` — BPM (signal)
- `quantum` — cycle length in beats

**Methods:**

- `beatToTime(beat)` → AudioContext time
- `timeToBeat(time)` → beat position

---

## Clock API

### Constructor Options

```typescript
interface ClockOptions {
  timeline: Timeline;
  audioContext: AudioContext;
  lookAhead?: number; // scheduling window in ms (default: 100)
  tickInterval?: number; // callback interval in ms (default: 25)
}
```

### Methods

- `start()` — begin playback
- `stop()` — stop and reset position
- `pause()` — stop without resetting

### TickWindow Interface

```typescript
interface TickWindow {
  time: {
    started: number; // audioContext.currentTime at start()
    current: number; // audioContext.currentTime now
    lookAheadEnd: number; // schedule up to this time
  };

  beat: {
    start: number; // window start in beats
    end: number; // window end in beats
    phase: number; // current phase (0 to quantum)
    quantum: number; // cycle length
  };

  missed?: {
    gapStart: number; // beat where gap began
    gapEnd: number; // beat where gap ended
    duration: number; // gap duration in ms
  };
}
```

---

## Usage

```typescript
const timeline = new Timeline({ tempo: 120, quantum: 4 });
const clock = new Clock({ timeline, audioContext });

clock.onTick((window) => {
  if (window.missed) {
    console.warn("Dropped beats:", window.missed.gapStart, "→", window.missed.gapEnd);
  }

  // Find which steps fall in this window
  // Schedule them with Web Audio timing
});

clock.start();
```
