# Latency Lab

A drum kit split into a lookahead-limited ("wet") path and a dry path, mixed back together — the
canonical consumer demo for [`defineGraph`](../../../../../docs/core.md#graph-helpers-definegraph) and its
[latency compensation (PDC)](../../../../../docs/core.md#latency-pdc). Lives at `/showroom/latency-lab`
on the site.

```bash
pnpm --filter @audiorective/web dev
# then open /showroom/latency-lab
```

Press **Play**. The limiter's worklet loads asynchronously, so the graph starts dry/click-only —
"Loading limiter…" clears once it's wired in.

## What it demonstrates

1. **`defineGraph` over direct refs, with a conditional bypass edge** — `Lab._build` returns an
   array of edges built from a plain callback, not a fixed `.connect()` topology:

   ```ts
   return [
     [beat, split],
     limiter && !this.limiterBypassed.value && [split, limiter, { label: "wet" }],
     limiter && !this.limiterBypassed.value && [limiter, master],
     [split, dry, { label: "dry" }],
     [dry, master],
     [click, master, { label: "click" }],
     [master, this._ctx.destination],
   ];
   ```

   Bypassing the limiter removes the wet branch outright rather than substituting a passthrough
   edge — `dry -> master` is already present, so a second `split -> master` copy would double the
   signal (+6 dB) instead of actually bypassing anything.

2. **PDC alignment, visualized with the `⏱` badge** — `GraphDiagram` reads `GraphHandle.snapshot()`
   after every solve and draws a `⏱ <samples>` badge on any edge whose `compensationSamples > 0`:
   the delay `defineGraph` inserted so that branch lands in step with the slower one at their
   shared join.

3. **Dynamic latency re-solve from a Param** — the lookahead slider (5–100 ms) writes
   `limiter.latency.value` directly; `latency` being a `Param` rather than a constructor option
   means the graph re-solves and the compensation delay on the dry branch updates live, with no
   rebuild.

4. **`perceivedTime` / `getPathLatency` for A/V sync** — `FlashRow` calls
   `core.getPathLatency(beat)` (and `click`) to get each source's samples-to-destination path
   latency, then `flashDelayMs` converts a hit's schedule time plus that latency plus
   `ctx.outputLatency` into a `setTimeout` delay, so the pad flash lands with the sound the
   listener actually hears rather than with when it was scheduled.

5. **Wrapping a worklet with declared latency, pinned by `assertLatency`** — `LookaheadLimiter`
   declares `latency: param({ default: Math.round(lookaheadSeconds * ctx.sampleRate) })` and
   forwards changes to the worklet over `port.postMessage`. `@audiorective/devtools`'s
   `assertLatency` can't be used directly here: its `build` callback is synchronous and gets
   handed an `OfflineAudioContext` it doesn't control the timing of, but a worklet module must be
   `addModule`'d onto the _exact_ context that later renders, and that's an async step that has to
   happen before construction. `LookaheadLimiter.test.ts` pins the same measurement by hand: it
   creates its own `OfflineAudioContext`, awaits `loadLimiterWorklet(ctx)`, and only then
   constructs the processor and renders an impulse through it.

6. **Headless testing of the whole graph offline** — `graph.test.ts` drives `createLabSetup()`
   against an `OfflineAudioContext` (no DOM, no real audio device) and asserts on the rendered
   samples: PDC on puts one aligned onset at `hitTime + limiter latency`; PDC off leaves the dry
   onset at `hitTime` and the wet-only residue (isolated by subtracting a solo dry render) at
   `hitTime + limiter latency`; bypass leaves a single unshifted onset with no doubled-signal
   residue.

## PDC toggle caveat

Toggling PDC disposes the whole root graph and rebuilds it (`Lab.setPdc`) — it isn't a live
per-edge change. Flipping it while the transport is playing re-wires audibly: whatever is
in flight through the old graph is interrupted.

## Structure

| Path                        | Role                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `audio/labSetup.ts`         | `createLabSetup` — builds the beat/click/graph, loads the worklet, wires the limiter in once ready                       |
| `audio/graph.ts`            | `Lab` — owns the root `defineGraph`, `limiterBypassed`/`pdcEnabled` params, `setPdc`, `snapshot`/`roles` for the diagram |
| `audio/Beat.ts`             | Output-only Sampler trio driven by the clock tick, exposing recent `hits` for the flash row                              |
| `audio/Click.ts`            | Output-only metronome burst per beat, gated by `enabled`                                                                 |
| `audio/LookaheadLimiter.ts` | `AudioProcessor` wrapping the `lookahead-limiter` worklet, with a Param-backed runtime latency                           |
| `audio/flashTime.ts`        | `flashDelayMs` — hit time + path latency + output latency → forward-looking flash delay                                  |
| `audio/engine.ts`           | `createEngine` + `createEngineContext` — owns the page's singleton `AudioContext`                                        |
| `LatencyLabApp.tsx`         | Astro island entry — mounts the app on `/showroom/latency-lab`                                                           |
| `ui/`                       | React observer layer: `GraphDiagram` (SVG from `Lab.snapshot()`), `Controls`, `FlashRow`                                 |

## Tests

```bash
pnpm --filter @audiorective/web test -- --run src/demos/latency-lab
```

All three test files run under the project's shared headless-Chromium vitest config — required
for `LookaheadLimiter.test.ts`'s real `OfflineAudioContext` and worklet support, and shared by
`graph.test.ts` and `flashTime.test.ts` for consistency.
