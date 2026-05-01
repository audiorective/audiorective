# @audiorective/threejs

Three.js bindings for [`@audiorective/core`](https://www.npmjs.com/package/@audiorective/core).

The integration layer between an audiorective engine and a three.js scene. Audio always lives in `@audiorective/core`; this package provides the scene-side glue — wiring the engine's `AudioContext` into three.js, syncing scene transforms onto audio nodes, and (over time) any other binding that needs the renderer or `Object3D` graph. Today it ships `attach` (engine ↔ renderer setup) and `PannerAnchor` (spatial transform sync). For the full API reference, see [`docs/threejs.md`](../../docs/threejs.md).

## Install

```bash
npm install @audiorective/core @audiorective/threejs
```

Peer dependency: `three` 0.150 or newer.

## attach

`attach(engine, renderer)` does two things, in order:

1. `THREE.AudioContext.setContext(engine.core.context)` — must run **before** any `THREE.AudioListener` is constructed so three.js uses the engine's context.
2. `engine.core.autoStart(renderer.domElement)` — arms the engine to start on the first pointer/key gesture inside the canvas.

Accepts a bare `AudioEngine` or the `{ core: AudioEngine }` wrapper from `createEngine`. Returns a detach function that unhooks the auto-start listener.

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

## PannerAnchor

`PannerAnchor` extends `THREE.Object3D`. Give it an externally-owned `PannerNode` (typically `spatial.panner` from a `Spatial` in core) and it keeps the panner's `positionX/Y/Z` and `orientationX/Y/Z` AudioParams in sync with the object's world transform — pushed inside an overridden `updateMatrixWorld`, once per frame.

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
camera.add(new THREE.AudioListener()); // keeps ctx.listener synced with the camera

const anchor = new PannerAnchor(engine.spatial.panner);
anchor.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
scene.add(anchor);
```

The anchor does **not** own the panner's lifetime — construct the `Spatial` in your engine, pass `spatial.panner` here, and let the engine own teardown. Removing the anchor from the scene stops position sync; the audio keeps playing at the last-written position.

## Framework integration

### Vanilla three.js

`attach` and `PannerAnchor` are plain TypeScript — no React required. See [`apps/sequencer-poc/src/scene/SpatialScene.ts`](../../apps/sequencer-poc/src/scene/SpatialScene.ts) for a worked example: a class that owns its own renderer / scene / camera, calls `attach(engine, renderer)` in the constructor, creates one `PannerAnchor` per track, and bridges core signals into the scene with `effect(...)` from [alien-signals](https://github.com/stackblitz/alien-signals).

### React Three Fiber

`PannerAnchor` is a plain `Object3D`, so it works as a primitive:

```tsx
import { useRef } from "react";
import type { Spatial } from "@audiorective/core";
import { PannerAnchor } from "@audiorective/threejs";

function SpatialSynth({ spatial }: { spatial: Spatial }) {
  const ref = useRef<PannerAnchor>(null);
  if (!ref.current) ref.current = new PannerAnchor(spatial.panner);
  return <primitive object={ref.current} />;
}
```

No `useFrame` needed — `updateMatrixWorld` runs as part of `renderer.render`. Cleanup is a no-op since the anchor doesn't own the panner.

## License

MIT — [GitHub](https://github.com/audiorective/audiorective)
