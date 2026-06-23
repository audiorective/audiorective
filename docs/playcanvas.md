# @audiorective/playcanvas

PlayCanvas bindings for `@audiorective/core`. The integration layer between an audiorective engine and a PlayCanvas application. Audio always lives in core; this package provides the scene-side glue — wiring the engine's `AudioContext` into PlayCanvas's `SoundManager`, and syncing scene transforms onto audio nodes.

It follows the same **anchor model** as `@audiorective/threejs`: audiorective owns the entire audio graph (source → effects → `Spatial` panner → destination), and the renderer only drives the panner's transform. The whole audio layer is reused verbatim across renderers. Pre-panner effects (FOH-style EQ, bus compression, instrument coloration) are simply how you wire the graph — they come for free, with no special hook.

Today the package ships `attach` (engine ↔ app setup) and `bindPanner` (entity transform → `PannerNode`).

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

The package binds almost entirely against PlayCanvas's stable public API (`Entity` transforms, the app `update` event), so it tracks the `peerDependencies` range without a pinned version matrix. Per-PR CI exercises it against the lockfile-pinned version.

## Package structure

```
playcanvas/src/
├── attach.ts        # share AudioContext + autoStart on the canvas
├── bindPanner.ts    # entity world transform → PannerNode (per frame)
└── index.ts
```

## Exports

```typescript
export { attach, bindPanner };
```

---

## `attach(engine, app)`

One-call setup that does two things:

1. **Shares the `AudioContext`** between the engine and PlayCanvas's `SoundManager`.
2. **Arms gesture autostart** on `app.graphicsDevice.canvas` via `engine.core.autoStart(canvas)`.

Returns a detach function that unhooks the autostart listener.

Accepts either a bare `AudioEngine` or the `{ core: AudioEngine }` wrapper returned by `createEngine`.

```typescript
import * as pc from "playcanvas";
import { createEngine } from "@audiorective/core";
import { attach } from "@audiorective/playcanvas";

const engine = createEngine((ctx) => {
  /* ... */
});

const app = new pc.Application(canvas, {});
const detach = attach(engine, app); // share AudioContext + arm autoStart
```

### AudioContext sharing — two valid orderings

PlayCanvas's `SoundManager` lazy-creates an `AudioContext` on first use.

**Path A — engine first (recommended).** `attach()` installs `engine.core.context` into PlayCanvas's `SoundManager` before any sound plays.

**Path B — PlayCanvas first.** Construct the engine with `{ context: app.soundManager.context }`; `attach()` verifies the contexts match.

If the two ever diverge, `attach` throws with actionable guidance.

### Listener sync is automatic

If the camera entity carries an `AudioListenerComponent` (PlayCanvas's standard idiom), PlayCanvas's `AudioListenerComponentSystem` drives `AudioContext.listener` from the camera's world transform **every frame, independent of any PlayCanvas sound instances**. Because the contexts agree, this spatializes all audiorective audio too. **The package ships nothing for listener sync** — you don't need it; just add an `audiolistener` component to the camera.

---

## `bindPanner(app, entity, panner)`

Drives an externally-owned `PannerNode` from a PlayCanvas entity's world transform, once per frame on the app's `update` event. The PlayCanvas counterpart to `@audiorective/threejs`'s `PannerAnchor`.

```typescript
function bindPanner(app: pc.AppBase, entity: pc.Entity, panner: PannerNode): () => void;
```

Each frame it writes the entity's world position into `panner.positionX/Y/Z` and the entity's forward vector into `panner.orientationX/Y/Z`. It writes once eagerly at call time so the panner isn't silent-at-origin until the first frame. Returns a disposer that unhooks the per-frame sync.

`bindPanner` does **not** own the panner's lifetime — it never disconnects or destroys it. The `Spatial` (or whoever created the panner) owns teardown; the disposer only stops the transform sync. Pass `engine.spatial.panner` in and let the engine own teardown.

> Convention note: three.js's `getWorldDirection()` returns `+Z`, whereas PlayCanvas's `entity.forward` is `-Z`. Both mean "the way the object faces", so the panner orientation is consistent across renderers.

---

## Usage

The engine owns the audio graph (including `Spatial` → `ctx.destination`). The PlayCanvas layer is purely cosmetic: it binds `Spatial.panner` to a scene entity so moving the entity pans the audio, and an `AudioListenerComponent` on the camera moves the listener.

### Basic spatial synth

```typescript
import * as pc from "playcanvas";
import { createEngine, Spatial } from "@audiorective/core";
import { attach, bindPanner } from "@audiorective/playcanvas";

const engine = createEngine((ctx) => {
  const synth = new MySynth(ctx);
  const spatial = new Spatial(ctx, { distanceModel: "inverse" });
  synth.output.connect(spatial.input);
  spatial.output.connect(ctx.destination);
  return { synth, spatial };
});

const app = new pc.Application(canvas, {});
attach(engine, app); // share AudioContext + arm autoStart

// Camera carries the listener — PlayCanvas syncs ctx.listener for free.
const camera = new pc.Entity("camera");
camera.addComponent("camera");
camera.addComponent("audiolistener");
app.root.addChild(camera);

// Emitter entity drives the panner.
const speaker = new pc.Entity("speaker");
speaker.setPosition(-3.5, 1.0, -4.0);
app.root.addChild(speaker);
bindPanner(app, speaker, engine.spatial.panner);

app.start();
```

Spatialization config (`distanceModel`, `refDistance`, `maxDistance`, `rolloffFactor`, cone angles) lives on the `Spatial` constructor in core — not on a PlayCanvas `SoundComponent`. Note core uses `rolloffFactor` (lowercase `o`), unlike PlayCanvas's `rollOffFactor`.

`Spatial` sets `panningModel = "HRTF"` explicitly, so you have full control over the panning model — there is no hard-coded value to work around.

### Audio without PlayCanvas

Because the `Spatial` lives in core and already connects to `ctx.destination`, the engine produces sound with or without any scene mounted. Skip `bindPanner` and the panner stays at origin — fully audible.

---

## Sync directions

**Visual → Audio** — `bindPanner` pushes the emitter entity's world position + forward into the `PannerNode` AudioParams; the camera's `AudioListenerComponent` pushes the camera transform into `AudioContext.listener`.

**Audio → Visual** — read `ComputedAccessor<T>` / `Param<T>` values from your `app.on('update', …)` callback or React component to drive visuals (e.g. analyser amplitude → emissive intensity).

---

## Lifecycle

`AudioProcessor.destroy()` is the cleanup primitive. The bindings do not own the audio:

- `attach()`'s disposer only removes the gesture-autostart listeners. Calling it doesn't tear down the audio engine or close the AudioContext.
- `bindPanner()`'s disposer only unhooks the per-frame `update` sync. It never disconnects the panner — `Spatial` owns that. (`app.destroy()` also tears down `update` listeners, but call the disposer explicitly if the app outlives the scene.)
- Tie `engine.core.destroy()` / `processor.destroy()` to your own scene-cleanup path.

---

## Why pre-panner

A real PA bakes its signature **before** the speakers; spatialization models propagation **after** the speakers. Source-character processing (FOH-style EQ, bus compression, instrument coloration) belongs upstream of the panner. In the anchor model that's just the natural wiring:

```
source → effects → spatial.panner → destination
```

For HRTF panning plus nonlinear effects, pre- vs. post-panner placement is audibly different: HRTF convolution shapes the spectrum per-ear and per-azimuth, so EQ applied after it interacts with a moving target as the listener turns, and stereo-linked dynamics pump based on head position. Wiring effects before `spatial.input` avoids all of that.

The `Spatial Music Room (PlayCanvas)` showroom demo uses pre-panner EQ to make this audible — try it with the EQ pushed and the camera moving.
