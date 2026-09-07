# Step Sequencer

A 4-track × 16-step drum machine, routed through a latency lab — the canonical consumer demo for [`@audiorective/clock`](../../../../../packages/clock) and for [`defineGraph`](../../../../../docs/core.md#graph-helpers-definegraph)'s [latency compensation (PDC)](../../../../../docs/core.md#latency-pdc). Lives at `/showroom/sequencer` on the site.

```bash
pnpm --filter @audiorective/web dev
# then open /showroom/sequencer
```

Press **Play**. Browsers require a user gesture before audio, which `EngineProvider`'s `autoStart` handles on that same click — there is no separate power-on step. The limiter's worklet loads asynchronously, so the latency lab below the grid shows "Loading limiter…" until it is wired in; the sequencer itself plays from the first gesture through the dry-only graph.

## What it demonstrates

### The sequencer

1. **`grid()` scheduling** — the whole sequencing logic is one loop over the pattern ruler's grid. No cursors, no modulo, no window-bounds bookkeeping, nothing to reset when the transport jumps:

   ```ts
   onTick: (window) => {
     for (const { time, step } of window.rulers.pattern.grid(patternLength)) {
       for (const track of this.tracks) {
         if (!track.mute.value && track.pattern.value[step]) {
           track.sampler.trigger({ when: time });
         }
       }
     }
   };
   ```

   The cycle region holds exactly one pass of the pattern, so `step` is already the pattern index — the ruler does the folding, and it stays in range across the wrap and any seek.

2. **The playhead reads the ruler at the time the listener is hearing** — `currentPattern` is the clock's reactive `current` reading, refreshed every tick at the render clock, and subscribing to it is what re-renders the grid each tick. But the highlight itself comes from `machine.patternAt(heardTime)`: the same ruler, read at `ctx.currentTime` minus `engine.latency` (the graph's compensated path latency) and `ctx.outputLatency`. With the limiter's lookahead at 100 ms, reading at the render clock would light each step most of a sixteenth before it sounds. No rAF loop, no parallel position state — one pure ruler reading at a time of the UI's choosing.
3. **Two rulers on one timeline** — rulers are stateless, so stacking them is free, and each answers a different question. `pattern` cycles (scheduling and the step highlight); `bar` counts forever (the absolute position readout, which a cycling ruler deliberately can't give).
4. **Live tempo** — the slider writes `timeline.bpm.value` mid-playback; the beat axis re-derives from the anchor, so nothing drifts and nothing needs rescheduling by hand.
5. **Transport** — play / pause / resume / stop, with button state from `useValue(clock.state)`. Resume continues mid-bar; stop returns to step 0.
6. **Live pattern editing** — toggle steps while playing, including the documented ~`lookAhead` latency when you edit a step whose window is already committed (asserted in the tests rather than hidden).
7. **The audio/UI split** — `DrumMachine` is headless: it owns the Timeline, the Clock, and four `Sampler`s, and runs entirely inside a unit test with no DOM. React only observes and calls methods.
8. **Both architectural axes at once** — `DrumMachine` is an `AudioProcessor` on the space axis (master gain + samplers, exposing `output` rather than wiring itself to `destination`) that consumes a `Clock` on the time axis. Holding a clock is the point; reimplementing one would be the error — see [`docs/architecture.md`](../../../../../docs/architecture.md). Exposing `output` is what lets the latency lab below route it without touching the machine.

### The latency lab

9. **`defineGraph` over direct refs, with a conditional bypass edge** — `LatencyLab._build` returns an array of edges built from a plain callback, not a fixed `.connect()` topology:

   ```ts
   return [
     [machine, split],
     limiter && !this.limiterBypassed.value && [split, limiter, { label: "wet" }],
     limiter && !this.limiterBypassed.value && [limiter, master],
     [split, dry, { label: "dry" }],
     [dry, master],
     [master, this._ctx.destination],
   ];
   ```

   Bypassing the limiter removes the wet branch outright rather than substituting a passthrough edge — `dry -> master` is already present, so a second `split -> master` copy would double the signal (+6 dB) instead of actually bypassing anything.

10. **PDC alignment, visualized with the `⏱` badge** — `GraphDiagram` reads `GraphHandle.snapshot()` after every solve and draws a `⏱ <samples>` badge on any edge whose `compensationSamples > 0`: the delay `defineGraph` inserted so that branch lands in step with the slower one at their shared join.
11. **Dynamic latency re-solve from a Param** — the lookahead slider (5–100 ms) writes `limiter.latency.value` directly; `latency` being a `Param` rather than a constructor option means the graph re-solves and the compensation delay on the dry branch updates live, with no rebuild. The playhead's heard-time offset grows with it, so the highlight stays on the sound.
12. **Wrapping a worklet with declared latency** — `LookaheadLimiter` declares `latency: param({ default: Math.round(lookaheadSeconds * ctx.sampleRate) })` and forwards changes to the worklet over `port.postMessage`. `lookaheadLimiter.test.ts` pins the declaration against where an impulse actually arrives: it creates its own `OfflineAudioContext`, awaits `loadLimiterWorklet(ctx)` (a worklet module must be added to the exact context that later renders), and only then constructs the processor.
13. **Headless testing of the whole graph offline** — `latencyLab.test.ts` drives `createSequencerSetup()` against an `OfflineAudioContext` and asserts on the rendered samples: PDC on puts one aligned onset at `hitTime + limiter latency`; PDC off leaves the dry onset at `hitTime` and the wet-only residue (isolated by subtracting a solo dry render) at `hitTime + limiter latency`; bypass leaves a single unshifted onset with no doubled-signal residue. One more test renders the _whole machine_ — clock and all — through the lab with `renderTimeline`, passing its tick source into `DrumMachine`: the same class that plays live schedules an offline bar.

## PDC toggle caveat

Toggling PDC disposes the root graph and rebuilds it (`LatencyLab.setPdc`) — it isn't a live per-edge change, and it doesn't touch the machine. Flipping it while the transport is playing re-wires audibly: whatever is in flight through the old graph is interrupted.

## Structure

| Path                        | Role                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `audio/DrumMachine.ts`      | The headless core — Timeline + Clock + tracks, transport, reactive surface, `patternAt(time)` for the heard playhead                |
| `audio/drumKit.ts`          | Procedurally synthesized kick/snare/hat/clap (no binary assets)                                                                     |
| `audio/stepFromPattern.ts`  | Cycle phase → step index; shared by the UI playhead and the tests                                                                   |
| `audio/heardTime.ts`        | Render clock − path latency − output latency → the time the listener is hearing                                                     |
| `audio/LatencyLab.ts`       | Owns the root `defineGraph` around the machine: `limiterBypassed`/`pdcEnabled` params, `setPdc`, `snapshot`/`roles` for the diagram |
| `audio/LookaheadLimiter.ts` | `AudioProcessor` wrapping the `lookahead-limiter` worklet, with a Param-backed runtime latency                                      |
| `audio/setup.ts`            | `createSequencerSetup` — builds the machine and the lab, loads the worklet, wires the limiter in once ready                         |
| `audio/engine.ts`           | `createEngine` + `createEngineContext` — owns the page's singleton `AudioContext`                                                   |
| `SequencerApp.tsx`          | Astro island entry — mounts the app on `/showroom/sequencer`                                                                        |
| `ui/`                       | React observer layer: `TransportBar`, `StepGrid`, `GraphDiagram` (SVG from `LatencyLab.snapshot()`), `LatencyControls`              |

## Tests

```bash
pnpm --filter @audiorective/web test -- --run tests/sequencer
```

Scheduling is verified deterministically. `DrumMachine`'s only injectable seam is `tickSource`, which offline rendering needs; "now" is mocked instead — an own `currentTime` property shadowing the prototype getter on a real context (a `Proxy` would fail Web Audio's brand-check; shadowing the instance doesn't) — and what got scheduled is read off `Sampler.trigger` itself. That last one is the real gain: the assertions cover the audio call the machine actually made, not a parallel notification that could keep firing after the trigger broke.

- `drumMachine.test.ts` — pattern state, scheduling across the wrap, mute, restart, the committed-window edit latency, live tempo, and `patternAt` (the heard-playhead reading, `null` before the segment starts).
- `smoke.test.ts` — the real `WorkerTickSource` against a real `AudioContext`, polling rather than sleeping.
- `heardTime.test.ts` — the render-clock-to-ear arithmetic.
- `latencyLab.test.ts` — the root graph rendered offline (PDC on / PDC off / bypass, and `engine.core.latency` tracking the limiter), plus the whole machine driven through the lab by `renderTimeline`.
- `lookaheadLimiter.test.ts` — the worklet's declared latency matches where an impulse actually arrives, at both 44.1 kHz and 48 kHz, and a mono impulse reaches every output channel.

## Deliberately out of scope

Swing, velocity, and per-note offsets are note-content concerns for a future track/clip primitive, not the clock's job — see the [clock design spec](https://github.com/audiorective/audiorective/blob/eaad3df1bf52ec319414b73640d273ae445ecbb2/docs/superpowers/specs/2026-07-04-clock-design.md).

Note that pattern repetition is _not_ out of scope here — it's the `CycleBarRuler`, and it's the same mechanism a DAW transport loop uses. The beat axis never jumps in either case; you read it modulo the region. Treating the two as different things would be a distinction the design doesn't actually make.

Design notes: [`docs/superpowers/specs/2026-07-12-step-sequencer-demo-design.md`](https://github.com/audiorective/audiorective/blob/eaad3df1bf52ec319414b73640d273ae445ecbb2/docs/superpowers/specs/2026-07-12-step-sequencer-demo-design.md) · [`docs/superpowers/specs/2026-09-02-latency-lab-demo-design.md`](../../../../../docs/superpowers/specs/2026-09-02-latency-lab-demo-design.md) · Clock guide: [`docs/clock.md`](../../../../../docs/clock.md)
