# @audiorective/threejs

Three.js integration via wrapping, not a parallel audio system.

## Dependencies

```json
{
  "dependencies": {
    "@audiorective/signals": "workspace:*"
  },
  "peerDependencies": {
    "three": ">=0.150.0"
  }
}
```

## Package Structure

```
threejs/src/
├── SpatialSource.ts
├── AudioAnalyser.ts
├── types.ts
└── index.ts
```

---

## Philosophy

Three.js has built-in audio (AudioListener, PositionalAudio). It works but lacks:

- Parameter automation
- Audio analysis
- Scheduling precision
- Reactive state

Audiorective wraps Three.js audio objects, exposes internals as signals, and adds missing capabilities. One audio system, enhanced.

---

## AudioProcessor Output Requirement

All AudioProcessors must expose their output node via `get output(): AudioNode`. Input is only required for effects processors.

```typescript
class MySynth extends AudioProcessor {
  private gainNode: GainNode;
  get output() {
    return this.gainNode;
  }
}

class Reverb extends AudioProcessor {
  private inputGain: GainNode;
  private outputGain: GainNode;
  get input() {
    return this.inputGain;
  }
  get output() {
    return this.outputGain;
  }
}
```

---

## SpatialSource

Extends `Object3D`. Attach to any mesh to make audio follow it in 3D space.

### Constructor Options

```typescript
interface SpatialOptions {
  distanceModel?: "linear" | "inverse" | "exponential";
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
}
```

### Class API

```typescript
class SpatialSource extends Object3D {
  readonly panner: PannerNode;

  readonly refDistance = reactiveParam(1);
  readonly maxDistance = reactiveParam(10000);
  readonly rolloffFactor = reactiveParam(1);

  get input(): AudioNode; // connect AudioProcessor output here

  constructor(listener: AudioListener, options?: SpatialOptions);

  updateMatrixWorld(force?: boolean): void; // syncs position + orientation to PannerNode

  destroy(): void;
}
```

Position and orientation sync happens automatically in `updateMatrixWorld` — called by Three.js render loop. Reactive properties (refDistance, maxDistance, rolloffFactor) sync to the PannerNode via effects.

---

## Usage

### Basic Spatial Audio

```typescript
const listener = new THREE.AudioListener();
camera.add(listener);

const synth = new MySynth(listener.context);

const spatial = new SpatialSource(listener);
synth.output.connect(spatial.input);

alienShip.add(spatial);
// synth sound now follows alienShip in 3D
```

### Chaining Effects

```typescript
const synth = new MySynth(ctx);
const reverb = new Reverb(ctx);
const compressor = new Compressor(ctx);

synth.output.connect(reverb.input);
reverb.output.connect(compressor.input);

const spatial = new SpatialSource(listener);
compressor.output.connect(spatial.input);

alienShip.add(spatial);
```

### Non-Spatial (Global) Audio

Connect directly to destination — no special handling:

```typescript
const backgroundMusic = new MusicPlayer(audioContext);
backgroundMusic.output.connect(audioContext.destination);
```

### Reactive Spatial Parameters

```typescript
const spatial = new SpatialSource(listener, {
  distanceModel: "inverse",
  refDistance: 1,
});

effect(() => {
  if (currentArea.value === "outdoor") {
    spatial.maxDistance.value = 500;
    spatial.rolloffFactor.value = 0.5;
  } else {
    spatial.maxDistance.value = 50;
    spatial.rolloffFactor.value = 2;
  }
});
```

---

## Sync Directions

**Audio → Visual**

- Frequency data → object scale/color
- Beat events → trigger animations
- Amplitude → emission intensity

**Visual → Audio**

- Object3D position → PannerNode position (handled by SpatialSource)
- Object velocity → filter cutoff, doppler
- Camera distance → reverb mix

---

## Update Timing

Two loops exist:

**Three.js render loop** — requestAnimationFrame, ~60fps

- Position sync happens here (via `updateMatrixWorld`)
- Read amplitude/frequency signals for visualization

**Audio clock** — look-ahead scheduling, sample-accurate

- Beat-synced events
- Precise timing for musical applications

For continuous visual sync, read signals in render loop.
For discrete events, use clock callbacks.

---

## React Three Fiber Support

R3F users get the same primitives via `useFrame`:

```typescript
function SpatialSynth({ mesh }) {
  const spatial = useRef<SpatialSource>();
  const synth = useRef<MySynth>();

  useEffect(() => {
    const listener = /* get from context */;
    synth.current = new MySynth(listener.context);
    spatial.current = new SpatialSource(listener);
    synth.current.output.connect(spatial.current.input);

    return () => {
      synth.current?.destroy();
      spatial.current?.destroy();
    };
  }, []);

  useFrame(() => {
    // Spatial position syncs automatically via updateMatrixWorld
    // Read analysis data for visuals here if needed
  });

  return (
    <primitive object={spatial.current} />
  );
}
```
