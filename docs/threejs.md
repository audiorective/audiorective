# @audiorective/threejs

Three.js bindings for `@audiorective/core`. Reuses three.js's built-in audio (`THREE.AudioListener`, `PannerNode`) instead of building a parallel system — audiorective provides reactive wrappers and glue.

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
├── SpatialSource.ts  # Object3D wrapping a PannerNode with reactive params
├── types.ts          # SpatialOptions
└── index.ts
```

## Exports

```typescript
export { attach, SpatialSource };
export type { SpatialOptions };
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

## `SpatialSource`

Extends `THREE.Object3D`. Wraps a `PannerNode` and exposes its parameters as reactive `Param<T>`s. Position and orientation follow the object's world transform automatically — just add it to a mesh.

### Constructor

```typescript
class SpatialSource extends THREE.Object3D {
  readonly panner: PannerNode;
  get input(): AudioNode;

  readonly refDistance: Param<number>;
  readonly maxDistance: Param<number>;
  readonly rolloffFactor: Param<number>;
  readonly distanceModel: Param<DistanceModelType>;
  readonly coneInnerAngle: Param<number>;
  readonly coneOuterAngle: Param<number>;
  readonly coneOuterGain: Param<number>;

  constructor(listener: THREE.AudioListener, options?: SpatialOptions);
  destroy(): void;
}

interface SpatialOptions {
  distanceModel?: DistanceModelType; // default "inverse"
  refDistance?: number; // default 1
  maxDistance?: number; // default 10000
  rolloffFactor?: number; // default 1
  coneInnerAngle?: number; // default 360
  coneOuterAngle?: number; // default 0
  coneOuterGain?: number; // default 0
}
```

The constructor wires `panner → listener.getInput()` automatically. Connect any `AudioNode` into `spatial.input` to feed the spatial path.

### World transform sync

`SpatialSource` overrides `updateMatrixWorld(force?)` to push the object's world position and forward vector into `panner.positionX/Y/Z.value` and `panner.orientationX/Y/Z.value`. Direct `.value` assignment is used (not `setValueAtTime`) — position sync happens once per frame, no sample-accurate automation needed, and this mirrors what three.js's own `PositionalAudio` does.

> three.js convention: `getWorldDirection()` returns the local `+Z` axis in world space. A default `Object3D` orients the panner to `(0, 0, 1)`.

### Reactive parameters

The seven panner parameters are all `Param<T>` with a `set` bind. Writing to `.value` propagates to the underlying `PannerNode` via an effect:

```typescript
spatial.maxDistance.value = 500;
spatial.rolloffFactor.value = 0.5;
spatial.distanceModel.value = "exponential";
```

Read them reactively from React with `useValue(spatial.refDistance)`, or from any `alien-signals` effect.

### `destroy()`

Disconnects the panner and destroys all seven params (stopping their bind effects). Remove the object from its parent separately.

---

## Usage

### Basic spatial synth

```typescript
import * as THREE from "three";
import { createEngine, AudioProcessor, type SchedulableParam } from "@audiorective/core";
import { attach, SpatialSource } from "@audiorective/threejs";

class Synth extends AudioProcessor<{ volume: SchedulableParam }> {
  private readonly _gain: GainNode;

  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    super(ctx, ({ param }) => ({
      params: { volume: param({ default: 0.5, bind: gain.gain }) },
    }));
    this._gain = gain;
  }

  get output() {
    return this._gain;
  }
}

const engine = createEngine((ctx) => ({ synth: new Synth(ctx) }));

const renderer = new THREE.WebGLRenderer({ canvas });
attach(engine, renderer);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();

const listener = new THREE.AudioListener();
camera.add(listener);

const spatial = new SpatialSource(listener, { distanceModel: "inverse" });
engine.synth.output.connect(spatial.input);

const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
mesh.add(spatial);
scene.add(mesh);

// render loop: renderer.render(scene, camera) already calls updateMatrixWorld.
```

### Chaining effects

```typescript
const synth = new MySynth(ctx);
const reverb = new Reverb(ctx);

synth.output.connect(reverb.input);
reverb.output.connect(spatial.input);
```

### Non-spatial (global) audio

Skip `SpatialSource` and connect straight to `ctx.destination` — works as usual.

---

## Sync directions

**Visual → Audio** — handled by `SpatialSource.updateMatrixWorld` (position + orientation → `PannerNode`).

**Audio → Visual** — read `ComputedAccessor<T>` / `Param<T>` values from your render loop or React component to drive visuals (e.g. analyser amplitude → emissive intensity).

---

## React Three Fiber

`SpatialSource` is a plain `Object3D`, so it works as a primitive:

```tsx
import { useFrame } from "@react-three/fiber";

function SpatialSynth({ listener, synth }) {
  const ref = useRef<SpatialSource>(null);

  useEffect(() => {
    const s = new SpatialSource(listener);
    synth.output.connect(s.input);
    ref.current = s;
    return () => s.destroy();
  }, [listener, synth]);

  return ref.current ? <primitive object={ref.current} /> : null;
}
```

No `useFrame` needed for position sync — `updateMatrixWorld` runs as part of `renderer.render`.
