# @audiorective/playcanvas

PlayCanvas bindings for `@audiorective/core`. The integration layer between an audiorective engine and a PlayCanvas application. Audio always lives in core; this package provides the scene-side glue — sharing the `AudioContext` with PlayCanvas's `SoundManager`, and producing audiorective-owned `SoundSlot`s whose per-instance graph routes through audiorective effect chains in the right position relative to the per-instance panner.

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

The **tested** version set lives in `packages/playcanvas/compat.json`. CI runs the package's tests against every version in `compat.tested`; a separate scheduled workflow flags PlayCanvas releases newer than `compat.latestKnown`. Update both fields together when promoting a new upstream version.

## Package structure

```
playcanvas/src/
├── attach.ts                              # share AudioContext + autoStart
├── createAudiorectiveSlot.ts              # factory: per-slot audiorective binding
├── AudiorectiveSoundSlot.ts               # SoundSlot subclass that owns the FX wiring
├── internal/
│   ├── AudiorectiveSoundInstance.ts       # 2D instance (pre-gain FX)
│   └── AudiorectiveSoundInstance3d.ts     # 3D instance (pre-panner FX)
└── index.ts
```

## Exports

```typescript
export { attach, createAudiorectiveSlot, AudiorectiveSoundSlot, AudiorectiveSoundInstance, AudiorectiveSoundInstance3d };
export type { AudiorectiveSlotOptions };
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

PlayCanvas's `SoundManager` lazy-creates an `AudioContext` on first use.

**Path A — engine first (recommended).** `attach()` installs `engine.core.context` into PlayCanvas's `SoundManager` before any sound plays.

**Path B — PlayCanvas first.** Construct the engine with `{ context: app.soundManager.context }`; `attach()` verifies the contexts match.

If the two ever diverge, `attach` throws with actionable guidance.

### Listener sync is automatic

If the camera entity carries an `AudioListenerComponent` (PlayCanvas's standard idiom), PlayCanvas's per-frame sync drives `AudioContext.listener` from the camera's world transform. Because the contexts agree, this works for all audiorective audio too. **The package ships nothing for listener sync** — you don't need it.

---

## `createAudiorectiveSlot(component, name, options?, audiorectiveOptions?)`

Adds an audiorective-managed `SoundSlot` to a `SoundComponent`. Mirrors `SoundComponent.addSlot()` (dup-name check, register, optional autoplay) but constructs an `AudiorectiveSoundSlot` so the per-instance Web Audio graph is built around an audiorective `AudioProcessor` from the start — no live-graph splice.

```typescript
function createAudiorectiveSlot(
  component: pc.SoundComponent,
  name: string,
  options?: SoundSlotOptions,
  audiorectiveOptions?: { processor?: AudioProcessor },
): AudiorectiveSoundSlot | null;
```

Returns `null` if a slot with the same name already exists on the component (matching `addSlot()`).

**Always use `createAudiorectiveSlot` for audiorective-owned audio, even without a processor.** The subclass is the extension point for future audiorective features (PDC, panner config, multi-processor chains, …) — having every audiorective slot already go through it means those features become opt-in field additions on `AudiorectiveSlotOptions`, never API churn.

### How the per-instance graph is built

When `slot.play()` calls `_createInstance()`, the subclass's override constructs an `AudiorectiveSoundInstance3d` (positional component) or `AudiorectiveSoundInstance` (non-positional). The instance's `_initializeNodes()` runs once with a class-static "pending processor" reference and produces the audible graph directly:

**Positional, with processor:**

```
source → processor.input → … → processor.output → panner → gain → destination
```

**Non-positional, with processor** (pre-gain — no panner exists):

```
source → processor.input → … → processor.output → gain → destination
```

**Without processor:** falls through to the stock graph. A slot created via `createAudiorectiveSlot()` without `audiorectiveOptions.processor` is byte-equivalent to a stock `SoundComponent.addSlot()` instance, just typed as `AudiorectiveSoundSlot`.

`this.panner` remains a standard `PannerNode`, so every positional setter on `SoundInstance3d` (position, maxDistance, refDistance, rollOffFactor, distanceModel) keeps working unchanged. Listener sync via `AudioListenerComponent` is unaffected.

The processor must be **effect-shaped**: both `processor.input` and `processor.output` defined `AudioNode`s. Instruments (output-only) throw with a clear message at instance construction.

### Example — per-track EQ chains

The PlayCanvas showroom demo builds one audiorective slot per track, each with its own `EQ3`. Track selection just repoints which EQ the UI reads from; parameter values are independent across tracks.

```typescript
import * as pc from "playcanvas";
import { createEngine } from "@audiorective/core";
import { attach, createAudiorectiveSlot } from "@audiorective/playcanvas";

const engine = createEngine((ctx) => ({
  /* … */
}));
const app = new pc.Application(canvas, {});
attach(engine, app);

const speaker = new pc.Entity();
speaker.addComponent("sound", { positional: true, refDistance: 1.5, maxDistance: 25 });
app.root.addChild(speaker);

const slots = tracks.map((track, i) => {
  const eq = new EQ3(engine.context);
  return createAudiorectiveSlot(speaker.sound!, `track-${i}`, { volume: 1, loop: false, overlap: false }, { processor: eq })!;
});

slots[0]!.asset = firstTrackAssetId;
slots[0]!.play();
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

The `Spatial Music Room (PlayCanvas)` showroom demo uses pre-panner EQ to make this difference audible — try it with the EQ pushed and the camera moving.

---

## Post-panner (`setExternalNodes`)

PlayCanvas's stock `slot.setExternalNodes(processor.input, processor.output)` still works on any `AudiorectiveSoundSlot`. Use it directly when you want a master-bus / headphone-correction effect rather than per-source character.

---

## Lifecycle

`AudioProcessor.destroy()` is the cleanup primitive. The slot does not own the processor:

- `attach()`'s disposer only removes the gesture-autostart listeners. Calling it doesn't tear down the audio engine or close the AudioContext.
- Destroying a slot (via `component.removeSlot(name)`) stops in-flight instances; in-flight nodes finish their natural lifecycle. The processor lives on — call `processor.destroy()` yourself when you're done with it.
- Entity-tied processors: tie `processor.destroy()` to your own scene-cleanup path.

---

## Sync directions

**Visual → Audio** — PlayCanvas's `AudioListenerComponent` syncs the camera's world transform to `AudioContext.listener`. Each positional `SoundComponent` slot syncs its emitter entity's transform to the slot's `PannerNode`. The package adds nothing here — PlayCanvas already does it.

**Audio → Visual** — read `ComputedAccessor<T>` / `Param<T>` values from your `app.on('update', …)` callback or React component to drive visuals.

---

## Known limitations

### HRTF panning is hard-coded

PlayCanvas creates each `PannerNode` without setting `panningModel`, so it defaults to Web Audio's `"HRTF"`. There is no public API to pick `"equalpower"`. A `configurePanner` option on `AudiorectiveSlotOptions` is on the roadmap.

### No PDC / latency compensation

PlayCanvas does not honour an `AudioProcessor.latencySamples` field. Effects with non-zero PDC inserted into slots play untrimmed and may drift relative to non-audiorective audio.

### Single processor per slot

The current `AudiorectiveSlotOptions.processor` slot is single-valued. For multi-stage pre-FX, compose your own pipeline processor (one input gain, N stages, one output gain). A `processors: AudioProcessor[]` option is reserved for a future release.

### Internal-property dependency

The package overrides `SoundInstance._initializeNodes()` and `SoundSlot._createInstance()`, both of which are JSDoc-private in PlayCanvas. The runtime methods are plain and overridable; PlayCanvas's audio module has been in maintenance mode since ~2017 so churn risk is low. Compatibility is enforced by the matrix CI job — see `packages/playcanvas/compat.json`.
