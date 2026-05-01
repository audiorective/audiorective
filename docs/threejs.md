# @audiorective/threejs

Three.js bindings for `@audiorective/core`. The integration layer between an audiorective engine and a three.js scene. Audio always lives in core; this package provides the scene-side glue — wiring the engine's `AudioContext` into three.js, syncing scene transforms onto audio nodes, and any other binding that needs the renderer or `Object3D` graph. Today it ships `attach` (engine ↔ renderer setup) and `PannerAnchor` (spatial transform sync).

## Dependencies

```json
{
  "dependencies": {
    "@audiorective/core": "workspace:*"
  },
  "peerDependencies": {
    "three": ">=0.150.0"
  }
}
```

## Package Structure

```
threejs/src/
├── attach.ts         # one-call engine ↔ renderer setup
├── PannerAnchor.ts   # Object3D that syncs world transform → PannerNode
└── index.ts
```

## Exports

```typescript
export { attach, PannerAnchor };
```

---

## `attach(engine, renderer)`

One-call setup that does two things in the right order:

1. `THREE.AudioContext.setContext(engine.core.context)` — must run **before** any `THREE.AudioListener` is constructed, so that three.js uses your engine's context instead of its own.
2. `engine.core.autoStart(renderer.domElement)` — arms the engine to start on the first pointer/key gesture inside the canvas.

Accepts either a bare `AudioEngine` or the `{ core: AudioEngine }` wrapper returned by `createEngine`.

Returns a detach function that unhooks the auto-start listener.

```typescript
import * as THREE from "three";
import { createEngine } from "@audiorective/core";
import { attach } from "@audiorective/threejs";

const engine = createEngine((ctx) => {
  const synth = new MySynth(ctx);
  return { synth };
});

const renderer = new THREE.WebGLRenderer({ canvas });
const detach = attach(engine, renderer);
```

---

## `PannerAnchor`

Extends `THREE.Object3D`. Takes an externally-owned `PannerNode` (typically from a `Spatial` in `@audiorective/core`) and keeps its `positionX/Y/Z` and `orientationX/Y/Z` AudioParams in sync with the object's world transform.

### Constructor

```typescript
class PannerAnchor extends THREE.Object3D {
  readonly panner: PannerNode;

  constructor(panner: PannerNode);
}
```

The anchor does **not** own the panner's lifetime — it never disconnects or destroys it. Construct the `Spatial` in your engine, pass `spatial.panner` in here, and let the engine own teardown. Removing the anchor from the scene stops position sync; the audio keeps playing at the last-written position.

### World transform sync

`PannerAnchor` overrides `updateMatrixWorld(force?)` to push the object's world position and forward vector into `panner.positionX/Y/Z.value` and `panner.orientationX/Y/Z.value`. Direct `.value` assignment is used (not `setValueAtTime`) — position sync runs once per frame, no sample-accurate automation needed, and this mirrors what three.js's own `PositionalAudio` does.

> three.js convention: `getWorldDirection()` returns the local `+Z` axis in world space. A default `Object3D` orients the panner to `(0, 0, 1)`.

---

## Usage

The engine owns the audio graph (including `Spatial` → `ctx.destination`). The three.js layer is purely cosmetic: it binds each `Spatial.panner` to a scene object so moving the object pans the audio.

### Basic spatial synth

```typescript
import * as THREE from "three";
import { createEngine, Spatial } from "@audiorective/core";
import { attach, PannerAnchor } from "@audiorective/threejs";

const engine = createEngine((ctx) => {
  const synth = new MySynth(ctx);
  const spatial = new Spatial(ctx, { distanceModel: "inverse" });
  synth.output.connect(spatial.input);
  spatial.output.connect(ctx.destination);
  return { synth, spatial };
});

const renderer = new THREE.WebGLRenderer({ canvas });
attach(engine, renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

// THREE.AudioListener keeps ctx.listener synced with the camera's transform.
const listener = new THREE.AudioListener();
camera.add(listener);

const anchor = new PannerAnchor(engine.spatial.panner);
const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
anchor.add(mesh);
scene.add(anchor);

// render loop: renderer.render(scene, camera) calls updateMatrixWorld on PannerAnchor.
```

### Audio without three.js

Because the `Spatial` lives in core and already connects to `ctx.destination`, the engine produces sound with or without any scene mounted. Skip `PannerAnchor` and the panner stays at origin — mono-ish unity pan, fully audible.

---

## Sync directions

**Visual → Audio** — `PannerAnchor.updateMatrixWorld` (world pos + forward → `PannerNode` AudioParams).

**Audio → Visual** — read `ComputedAccessor<T>` / `Param<T>` values from your render loop or React component to drive visuals (e.g. analyser amplitude → emissive intensity).

---

## React Three Fiber

`PannerAnchor` is a plain `Object3D`, so it works as a primitive:

```tsx
function SpatialSynth({ spatial }: { spatial: Spatial }) {
  const ref = useRef<PannerAnchor>(null);
  if (!ref.current) ref.current = new PannerAnchor(spatial.panner);
  return <primitive object={ref.current} />;
}
```

No `useFrame` needed for position sync — `updateMatrixWorld` runs as part of `renderer.render`. Cleanup is a no-op since the anchor doesn't own the panner.
