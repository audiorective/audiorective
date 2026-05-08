# @audiorective/playcanvas

PlayCanvas bindings for `@audiorective/core`. The integration layer between an audiorective engine and a PlayCanvas application. Audio always lives in core; this package provides the scene-side glue — sharing the `AudioContext` with PlayCanvas's `SoundManager`, and routing audiorective effect chains into PlayCanvas `SoundSlot`s in the right position relative to the per-instance panner.

The headline capability: **pre-panner effect injection**, which PlayCanvas's public `setExternalNodes` API does not natively support. This is the placement source-character processing (FOH-style EQ, bus compression, instrument coloration) actually needs — see "Why pre-panner" below.

## Dependencies

```json
{
  "dependencies": {
    "@audiorective/core": "workspace:*"
  },
  "peerDependencies": {
    "playcanvas": ">=2.18.1"
  }
}
```

## Package structure

```
playcanvas/src/
├── attach.ts        # one-call engine ↔ app setup (shared AudioContext + autoStart)
├── bindEffect.ts    # insert an audiorective AudioProcessor into a SoundSlot, pre or post panner
└── index.ts
```

## Exports

```typescript
export { attach, bindEffect };
export type { BindEffectOptions };
```

---

## `attach(engine, app)`

One-call setup that:

1. **Shares the `AudioContext`** between the engine and PlayCanvas's `SoundManager`.
2. **Arms gesture autostart** on `app.graphicsDevice.canvas` via `engine.core.autoStart(canvas)`.

Returns a detach function that unhooks the autostart listener.

Accepts either a bare `AudioEngine` or the `{ core: AudioEngine }` wrapper returned by `createEngine`.

```typescript
import * as pc from "playcanvas";
import { createEngine } from "@audiorective/core";
import { attach } from "@audiorective/playcanvas";

const engine = createEngine((ctx) => ({
  /* ... */
}));

const app = new pc.Application(canvas, {
  /* ... */
});
const detach = attach(engine, app); // share AudioContext + arm autoStart
```

### AudioContext sharing — two valid orderings

PlayCanvas's `SoundManager` lazy-creates an `AudioContext` on first use. There are two ways to make sure both halves agree on a single context:

**Path A — engine first (recommended).** Construct the engine first; `attach()` installs `engine.core.context` into PlayCanvas's `SoundManager` before any sound plays. Idiomatic and order-independent at the user's level — just call `attach()` before triggering any sound.

```typescript
const engine = createEngine((ctx) => ({
  /* ... */
}));
const app = new pc.Application(canvas, {
  /* ... */
});
attach(engine, app); // installs engine.core.context into app.systems.sound
// safe to add SoundComponents and play sounds from here on
```

**Path B — PlayCanvas first.** Let PlayCanvas create the context (by reading `app.systems.sound.context`), then construct the engine with it.

```typescript
const app = new pc.Application(canvas, {
  /* ... */
});
const engine = createEngine(
  (ctx) => ({
    /* ... */
  }),
  {
    context: app.systems.sound.context,
  },
);
attach(engine, app); // verifies the contexts are identical (no-op if so)
```

If the two ever diverge (e.g. the engine was constructed with a different context than the one PlayCanvas already created), `attach` throws with actionable guidance.

### Listener sync is automatic

If the camera entity carries an `AudioListenerComponent` (PlayCanvas's standard idiom), PlayCanvas's per-frame sync drives `AudioContext.listener` from the camera's world transform. Because the contexts agree, this works for all audiorective audio too. **The package ships nothing for listener sync** — you don't need it.

---

## `bindEffect(slot, processor, options?)`

Insert an audiorective `AudioProcessor` (effect-shaped — exposes both `.input` and `.output`) into a `SoundSlot`, either before or after the per-instance panner.

```typescript
function bindEffect(
  slot: pc.SoundSlot,
  processor: AudioProcessor,
  options?: { position?: "pre" | "post" }, // default: "pre"
): () => void;
```

Returns a disposer that detaches the binding. Does **not** call `processor.destroy()` — the processor's lifetime is owned by the engine, not the slot.

The processor must be **effect-shaped**: both `processor.input` and `processor.output` must be defined `AudioNode`s. Instruments (which only declare `output`) cannot be inserted as effects; `bindEffect` throws with a clear message if you try.

### `position: "pre"` (default) — the FOH placement

Resulting graph for each new `SoundInstance3d`:

```
source → processor.input → … → processor.output → panner → gain → destination
```

Implementation: the package subscribes to the slot's `play` event and, on each new instance, splices the processor into the live `source → panner` edge. On the instance's `end`/`stop`, the splice is torn down. PlayCanvas does not expose this insertion point publicly; this is workaround #2 from the audiorective PlayCanvas audit. Stable on PlayCanvas 2.18.1 (the audited version, our peer-dep floor); review on engine upgrades.

### `position: "post"` — the headphone-correction placement

Resulting graph (PlayCanvas's stock `setExternalNodes` shape):

```
source → panner → gain → processor.input → … → processor.output → destination
```

Implementation: thin wrapper around `slot.setExternalNodes(processor.input, processor.output)`; disposer calls `slot.clearExternalNodes()`.

### Example

```typescript
import * as pc from "playcanvas";
import { createEngine } from "@audiorective/core";
import { attach, bindEffect } from "@audiorective/playcanvas";

const engine = createEngine((ctx) => ({ eq: new EQ3(ctx) }));

const app = new pc.Application(canvas, {
  /* ... */
});
attach(engine, app);

const speaker = new pc.Entity();
speaker.addComponent("sound", { positional: true, refDistance: 1.5, maxDistance: 25 });
const slot = speaker.sound!.addSlot("music", { volume: 1 })!;
slot.asset = trackAssetId;
app.root.addChild(speaker);

// FOH-style EQ before spatialization. Default position: "pre".
const dispose = bindEffect(slot, engine.eq);

// later: slot.play();
// later still: dispose(); // unbind future instances; in-flight ones finish + clean up.
```

---

## Why pre-panner

PlayCanvas's `SoundInstance3d` builds a fixed graph:

```
source → panner (HRTF, hard-coded) → gain → [setExternalNodes user chain] → destination
```

`setExternalNodes` is the only public hook. It injects **post-panner and post-gain** — the wrong position for source-character processing. EQ-and-compress at that point operates on the listener's-ear signal, not the source PA, which produces:

- **Position-dependent EQ.** HRTF convolution shapes the spectrum per-ear and per-azimuth before the EQ sees it; the curve interacts with a moving target as the listener turns.
- **Compressor pumping tied to head position.** Stereo-linked dynamics duck based on the louder ear, producing artefacts that track listener orientation rather than the music.
- **Inverted mental model.** A real PA bakes its signature _before_ the speakers; spatialization models propagation _after_ the speakers.

For LTI effects through `equalpower` panning, pre vs. post-panner placement differs only by per-channel gain. For **HRTF + nonlinear effects**, the two paths sound audibly different.

The `Spatial Music Room (PlayCanvas)` showroom demo flips between `position: "pre"` and `position: "post"` to make this difference audible — try it with the EQ pushed and the camera moving.

---

## Lifecycle

`AudioProcessor.destroy()` is the cleanup primitive. It is independent of `attach`/`bindEffect` disposers:

- `attach`'s disposer only removes the gesture-autostart listeners. Calling it doesn't tear down the audio engine or close the AudioContext.
- `bindEffect`'s disposer only removes the slot subscription (and, for `"post"`, calls `clearExternalNodes`). In-flight instances finish naturally and clean up via their own end/stop listeners. Calling it never destroys the processor.
- Entity-tied processors: tie `processor.destroy()` to your own scene-cleanup path.

---

## Sync directions

**Visual → Audio** — PlayCanvas's `AudioListenerComponent` syncs the camera's world transform to `AudioContext.listener`. Each positional `SoundComponent` slot syncs its emitter entity's transform to the slot's `PannerNode`. The package adds nothing here — PlayCanvas already does it.

**Audio → Visual** — read `ComputedAccessor<T>` / `Param<T>` values from your `app.on('update', ...)` callback or React component to drive visuals.

---

## Known limitations

### HRTF panning is hard-coded

PlayCanvas creates each `PannerNode` without setting `panningModel`, so it defaults to Web Audio's `"HRTF"`. There is no public API to pick `"equalpower"`. For projects that want to reason about effect commutativity with the spatializer (LTI filters compose differently through HRTF than through equalpower), this matters. A `configurePanner(slot, { panningModel })` helper that mutates each new instance's panner is on the roadmap.

### No PDC / latency compensation

PlayCanvas does not honour an `AudioProcessor.latencySamples` field. Effects with non-zero PDC inserted into slots play untrimmed and may drift relative to non-audiorective audio. Recommendation: sample-style SFX and effect chains accept the limitation; latency-critical paths (sequencer-aligned audio, sample-accurate triggering) should wait for audiorective-native synth emitters.

### Pre-panner is single-processor-per-slot

Chaining multiple pre-effects on one slot is via a user-built composite processor (one input gain, several stages, one output gain). Stacked `bindEffect(..., { position: "pre" })` calls on the same slot are not supported.

### Peer-dep version pinning

`position: "pre"` reads `instance.source` and `instance.panner` from PlayCanvas's `SoundInstance3d`. These are public-but-not-API-stability-guaranteed properties. Tested against `playcanvas@2.18.1`. Pin or test before upgrading.
