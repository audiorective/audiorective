# Step Sequencer

A 4-track × 16-step drum machine — the canonical consumer demo for [`@audiorective/clock`](../../packages/clock).

```bash
pnpm --filter @audiorective/step-sequencer dev
```

Press **Play**. Browsers require a user gesture before audio, which `EngineProvider`'s `autoStart` handles on that same click — there is no separate power-on step.

## What it demonstrates

1. **`grid()` scheduling** — the whole sequencing logic is one loop over the bar ruler's 16th-note grid, with `index % 16` for pattern lookup. No cursors, no window-bounds bookkeeping, nothing to reset when the transport jumps:

   ```ts
   onTick: (window) => {
     for (const { time, index } of window.rulers.bar.grid(16)) {
       const step = index % 16;
       for (const track of this.tracks) {
         if (!track.mute.value && track.pattern.value[step]) {
           track.sampler.trigger({ when: time });
         }
       }
     }
   };
   ```

2. **Reactive `current` as the visual-sync surface** — the playhead column and the `bar : beat` readout both come from `timeline.rulers.bar.current`, a `Param` the clock refreshes each tick. No rAF loop, no parallel position state.
3. **Live tempo** — the slider writes `timeline.bpm.value` mid-playback; the beat axis re-derives from the anchor, so nothing drifts and nothing needs rescheduling by hand.
4. **Transport** — play / pause / resume / stop, with button state from `useValue(clock.state)`. Resume continues mid-bar; stop returns to step 0.
5. **Live pattern editing** — toggle steps while playing, including the documented ~`lookAhead` latency when you edit a step whose window is already committed (asserted in the tests rather than hidden).
6. **The audio/UI split** — `DrumMachine` is headless: it owns the Timeline, the Clock, and four `Sampler`s, and runs entirely inside a unit test with no DOM. React only observes and calls methods.
7. **Both architectural axes at once** — `DrumMachine` is an `AudioProcessor` on the space axis (master gain + samplers, exposing `output` rather than wiring itself to `destination`, so it can be routed through an EQ or reverb) that consumes a `Clock` on the time axis. Holding a clock is the point; reimplementing one would be the error — see [`docs/architecture.md`](../../docs/architecture.md).

## Structure

| Path                       | Role                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| `src/audio/DrumMachine.ts` | The headless core — Timeline + Clock + tracks, transport, reactive surface |
| `src/audio/drumKit.ts`     | Procedurally synthesized kick/snare/hat/clap (no binary assets)            |
| `src/audio/stepFromBar.ts` | Bar reading → step index; shared by the UI playhead and the tests          |
| `src/audio/engine.ts`      | `createEngine` + `createEngineContext` — owns the AudioContext             |
| `src/ui/`                  | React observer layer, reading the machine via `useEngine()`                |

## Tests

```bash
pnpm --filter @audiorective/step-sequencer test -- --run
```

Scheduling is verified deterministically: a `ManualTickSource` plus a plain `{ currentTime }` time source means ticks fire only when the test says and "now" only moves when the test moves it, so every assertion is exact. One smoke test runs the real `WorkerTickSource` against a real `AudioContext`.

## Deliberately out of scope

Swing, velocity, and per-note offsets are note-content concerns for a future track/clip primitive, not the clock's job — see the [clock design spec](../../docs/superpowers/specs/2026-07-04-clock-design.md). Looping is likewise absent by design: a 16-step pattern loops via `index % 16` over the infinite grid, which is exactly the sequencer idiom the spec describes (a `CycleBarRuler` loop region is for DAW-style transport loops).

Design notes: [`docs/superpowers/specs/2026-07-12-step-sequencer-demo-design.md`](../../docs/superpowers/specs/2026-07-12-step-sequencer-demo-design.md) · Clock guide: [`docs/clock.md`](../../docs/clock.md)
