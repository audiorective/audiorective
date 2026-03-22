# Audiorective — Agent Instructions

Modular toolkit for web audio development. Independent, composable packages that work alone or together.

See `docs/overview.md` for project vision, design rationale, and roadmap.
See `docs/` for full API references per package.

## Monorepo Structure

```
@audiorective/
├── signals      # Reactive state for audio parameters (alien-signals)
├── clock        # Timing, scheduling, transport
├── react        # React bindings
└── threejs      # Three.js spatial audio integration
```

## Core Conventions

### The `.value` Pattern

Matches native Web Audio API. Wraps alien-signals internally:

```typescript
synth.volume.value = 0.5; // set (calls signal internally)
synth.volume.linearRampToValueAtTime(1, time); // schedule — same as native AudioParam
```

### Signal Exposure via `$`

Raw alien-signals function exposed for advanced/framework use:

```typescript
synth.volume.value; // .value getter/setter (tracked by effects)
synth.volume.$(); // raw signal read (also tracked)
synth.volume.$(0.8); // raw signal write
```

### `param()` — Single Entry Point

Always use `param()` to create parameters. It returns:

- `Param<T>` for non-numeric types
- `SchedulableParam` for numeric types (adds Web Audio scheduling methods)

```typescript
bpm = this.param({ default: 120 }); // JS scheduling (~16ms)
volume = this.param({ default: 0.5, bind: (self) => self.gain.gain }); // native scheduling (sample-accurate)
waveform = this.param<OscType>({ default: "sine", bind: { get, set } }); // reactive sync to property
```

## `bind` Rules

| Shape                  | When to use                        | Scheduling               |
| ---------------------- | ---------------------------------- | ------------------------ |
| No `bind`              | Pure JS state (BPM, step position) | JS (~16ms via rAF)       |
| `(self) => AudioParam` | Controls a Web Audio node param    | Native (sample-accurate) |
| `{ get, set }`         | Sync to non-AudioParam property    | Reactive effect          |

All numeric params share the same `SchedulableParam` type and API regardless of bind. Implementation is hidden.

## Scheduling Model

JS-scheduled and native-scheduled params have identical API surfaces:

```typescript
synth.bpm.linearRampToValueAtTime(180, now + 4); // JS-scheduled
synth.volume.linearRampToValueAtTime(1, now + 4); // native-scheduled
```

|           | JS Scheduling | Native Scheduling       |
| --------- | ------------- | ----------------------- |
| Thread    | Main (rAF)    | Audio                   |
| Precision | ~16ms         | Sample-accurate         |
| Use for   | BPM, UI state | Gain, frequency, filter |

**AudioParam sync strategy:** For native-backed params, scheduling methods delegate to the real AudioParam. A `setInterval` poll at ~60fps reads `AudioParam.value` back into the signal so UI stays reactive during automations. Polling stops after estimated automation duration.

## Design Rules

1. **Web Audio API consistency** — `.value` pattern everywhere
2. **Signal exposure** — always expose `$` for raw signal access
3. **Method-based API** — `param()`, not decorators. Clear, type-safe, discoverable
4. **Automatic dependency tracking** — no manual dep arrays. Effects/computed auto-track
5. **`reactiveParam` for standalone use** — same `.value` API without AudioProcessor inheritance
6. **Graph helpers** — `defineNodes`/`connectNodes` for declarative, type-safe audio routing
7. **Framework agnostic** — core works in Node.js, React, Vue, Svelte, vanilla
8. **No state duplication** — AudioProcessor owns all state. UI frameworks observe/mutate directly. No separate store.
9. **Unified SchedulableParam** — one type regardless of backing. `bind` with AudioParam is an internal optimization, not a type distinction.

## AudioProcessor Base Class

All processors extend `AudioProcessor`:

- Must implement `get output(): AudioNode`
- Optional `get input(): AudioNode` for effects
- Has `param()`, `computed()`, `effect()`, `getState()`, `setState()`, `destroy()`

## Package Dependencies

- `signals`: depends on `alien-signals`
- `clock`: peer-depends on `signals`
- `react`: depends on `signals`, peer-depends on `react`
- `threejs`: depends on `signals`, peer-depends on `three`
