# Audiorective — Overview

Modular toolkit for web audio development. Independent, composable packages that work alone or together.

**Target users:** Audio engineers, creative coders, researchers who understand DSP and want cleaner web integration.

## Core Problems Solved

1. **Audio-visual sync gap** — Web Audio uses time-based automation; UI frameworks use state. These don't naturally talk.
2. **Imperative graph management** — `.connect()`/`.disconnect()` is error-prone and impossible to tear down cleanly.
3. **No reactive audio state** — Changing an AudioParam doesn't notify your React component. No more parallel state systems.

## Playback Primitives

`@audiorective/core` ships three ready-to-use players: **`Sampler`** (buffer-backed, polyphonic pad — fire `trigger()` for SFX and one-shots), **`BufferPlayer`** (buffer-backed single playhead with `start`/`stop`/loop and a schedulable rate — for beat-locked loops and stems), and **`FilePlayer`** (streaming track with a single play/pause/seek transport — for music and long-form audio). All are output-only `AudioProcessor`s; route `player.output` through `Spatial` or directly to `ctx.destination`. See `choosing-playback.md` to pick between them.

## Key Design Decisions

- **alien-signals 3.x callable API** — signals are callable functions (`signal()` to read, `signal(value)` to write), not objects with `.get()`/`.set()`. `SignalAccessor<T>` and `ComputedAccessor<T>` are defined in `types.ts`.
- **`.value` over function-call syntax** — matches Web Audio conventions (`gainNode.gain.value = 0.5`), reduces cognitive load for audio engineers.
- **`param()` not decorators** — method-based, type-safe, discoverable, works with class field declarations.
- **`$` prefix for raw signal access** — escape hatch for framework adapters that need the underlying alien-signals accessor.
- **`Cell` for structured state** — Immer `produce` for ergonomic immutable updates, separate from the param system.
- **Plain classes for state-only types** — classes that only hold structured state (no audio nodes, no scheduling) should be plain classes with `Cell`, not `AudioProcessor` subclasses.
- **rAF polling for AudioParam → signal sync at ~60fps** — pragmatic tradeoff: not perfectly real-time but good enough for UI updates.
- **`bind` option unifies AudioParam backing and custom sync** — one field on `ParamOptions` covers both schedulable AudioParam binding and arbitrary `{ get, set }` sync.
- **No state duplication** — `AudioProcessor` owns all state; UI observes and mutates directly.

## Roadmap

**V1:** signals, react, threejs, playcanvas, docs site
**V2:** analysis (FFT, beat detection), Vue bindings
**V3:** Phaser.js, component library
