# Audiorective — Overview

Modular toolkit for web audio development. Independent, composable packages that work alone or together.

**Target users:** Audio engineers, creative coders, researchers who understand DSP and want cleaner web integration.

## Core Problems Solved

1. **Audio-visual sync gap** — Web Audio uses time-based automation; UI frameworks use state. These don't naturally talk.
2. **Imperative graph management** — `.connect()`/`.disconnect()` is error-prone and impossible to tear down cleanly.
3. **No reactive audio state** — Changing an AudioParam doesn't notify your React component. No more parallel state systems.

## Key Design Rationale

- **`.value` over function-call syntax** — matches Web Audio conventions, reduces cognitive load for audio engineers
- **`param()` not decorators** — method-based is clearer, type-safe, works with class field declarations
- **Two-phase graph definition** — `defineNodes()` captures type info, `connectNodes()` uses it for autocomplete. Inspired by Kysely's type inference approach.
- **Clock doesn't own state** — separation of concerns. Signals own state, clock provides timing windows.
- **Polling for AudioParam sync** — pragmatic tradeoff: not perfectly real-time but good enough for UI updates at ~60fps

## Roadmap

**V1:** signals, clock (constant tempo), react, threejs, docs site
**V2:** tempo automation, analysis (FFT, beat detection), Vue bindings
**V3:** full tempo maps, Phaser.js, component library
