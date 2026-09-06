# FX Rack

A live effects processor and offline export engine — five inserts, two sends, compression, and a limiter. Built with [`@audiorective/effects`](../../../../../packages/effects). Lives at `/showroom/fx-rack` on the site.

```bash
pnpm --filter @audiorective/web dev
# then open /showroom/fx-rack
```

Press **Play** to loop the drum stems, or hit the pads to trigger drum sounds. The engine will start on the first gesture (powered by `EngineProvider`'s `autoStart`). Use the faders and knobs to shape the sound through the effects chain, then hit **Export** to render and download the result as a WAV file.

## What it demonstrates

1. **Wet-fader bypass** — every insert has a `wet` fader that crossfades dry against the effect. At `wet = 0`, the effect is fully bypassed, yet the module stays connected in the graph and lit on the UI, showing that effects don't disconnect:

   ```ts
   {
     key: "filter",
     title: "Filter",
     pick: (rack) => ({
       fader: { label: "Wet", param: rack.inserts.filter.params.wet, min: 0, max: 1, step: 0.01 },
       knob: { label: "Frequency", param: rack.inserts.filter.params.frequency, … },
     }),
   }
   ```

2. **Engine toggle and latency tracking** — the pitch shifter has two engines (granular and stretch), toggled live. The module shows the pitch shifter's own `latency` and a total path latency computed from the graph's `arrivalOf` call. Switching engines rebuilds the entire rack while preserving every other setting, and Plugin Delay Compensation (`compensate: true` in `defineGraph`) keeps the send returns aligned:

   ```ts
   const switchTo = async (pitchEngine: PitchShiftEngine) => {
     const old = rack.value;
     const settings = readSettings(old);
     const next = build(pitchEngine, old.deck.buffer);
     await next.ready;
     applySettings(next, settings);
     old.destroy();
     rack.value = next;
   };
   ```

3. **Reduction meters** — the Compressor and Limiter each expose `cells.reduction`, a real-time gain-reduction readout that animates as audio is compressed:

   ```ts
   <Meter
     title="Compressor"
     pick={(rack) => ({
       reduction: rack.compressor.cells.reduction,
       threshold: { param: rack.compressor.params.threshold, … },
     })}
   />
   ```

4. **Offline export with the same class** — "Export 4 bars" calls `renderOffline` with an `OfflineAudioContext`, feeds it the same `FxRack` class running the live demo, renders the pad pattern through all settings, and encodes the result to WAV in the browser with no server round-trip:

   ```ts
   export async function exportBars(bars: number, bpm: number, settings: RackSettings, loop: AudioBuffer | null): Promise<Blob> {
     const buffer = await renderOffline({ seconds: (bars * 4 * 60) / bpm + 1 }, async (ctx) => {
       const rack = new FxRack(ctx, { kit: createDrumKit(ctx), loop, pitchEngine: settings.engine });
       await rack.ready;
       applySettings(rack, settings);
       rack.scheduleBars(bars, bpm, 0);
     });
     return encodeWav(buffer);
   }
   ```

5. **Graph readout from snapshot** — a small table lists every node's latency and arrival time, plus all edges that needed compensation. The readout reads the graph's last solve via `snapshot()` and computes total path latency from `arrivalOf(limiter)`:

   ```ts
   const refresh = () => {
     setSnapshot(rack.graph.snapshot());
     setTotalLatency(rack.graph.arrivalOf(rack.limiter));
   };
   ```

## Structure

| Path                       | Role                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `audio/FxRack.ts`          | Headless FX processor — inserts, sends, compressor, limiter, and the whole signal graph |
| `audio/engine.ts`          | `createEngine` + `createEngineContext` — owns the AudioContext and engine-toggle logic  |
| `audio/exportBars.ts`      | `exportBars` function and settings serialization; calls `renderOffline`                 |
| `audio/impulseResponse.ts` | Procedurally generated reverb IR (exponential noise decay, no asset)                    |
| `audio/wavEncode.ts`       | Browser WAV encoder for the export output                                               |
| `FxRackApp.tsx`            | Astro island entry — mounts the app on `/showroom/fx-rack`                              |
| `ui/`                      | React observer layer, reading the rack via `useEngine()`                                |

## Tests

```bash
pnpm --filter @audiorective/web test -- --run tests/fx-rack
```

The headless `FxRack` constructs against an `OfflineAudioContext`, renders one bar of the pad pattern, and asserts that the output is non-silent, stays under the limiter threshold, and that setting every insert's `wet` to 0 reproduces the dry sum within `< 1e-3` mean absolute difference over a subsampled window.

## Deliberately out of scope

The delay has no tempo sync — `PingPongDelay.delayTime` is always in seconds; the app or a higher-level scheduler converts beats to durations. The `Compressor` and `Limiter` are plain feedforward dynamics with no modelled-hardware presets (VCA, FET, opto modes). Both are design constraints owned by the effects package, not specific to this demo.

Design notes: [`docs/superpowers/specs/2026-09-06-effects-package-design.md`](https://github.com/audiorective/audiorective/blob/main/docs/superpowers/specs/2026-09-06-effects-package-design.md#part-8--showroom-demo-fx-rack) · Effects guide: [`docs/effects.md`](../../../../../docs/effects.md)
