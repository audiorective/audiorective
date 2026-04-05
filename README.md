# Audiorective

The wholestack audio primitives.

Native audio development has mature frameworks like JUCE that handle audio threading, parameter automation, host communication, and UI binding. Web Audio has no equivalent. Tone.js is a music-production library, not a general-purpose audio application framework.

Audiorective fills that structural gap — JUCE-grade infrastructure for the web platform, distributed as independent, composable packages. Each package solves a specific recurring problem in web audio development, from reactive state management to scheduling, analysis, and beyond.

```typescript
synth.volume.value = 0.8;
synth.volume.linearRampToValueAtTime(0, ctx.currentTime + 2);

const [volume, setVolume] = useParam(synth.volume);
```

The `.value` pattern matches native Web Audio conventions. Params are backed by fine-grained signals ([alien-signals](https://github.com/nicepkg/alien-signals)), so changes flow both ways — UI to audio thread and back — with no parallel state systems.

## Packages

| Package                                   | Description                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| [`@audiorective/core`](./packages/core)   | Reactive primitives for Web Audio — Param, AudioProcessor, AudioEngine |
| [`@audiorective/react`](./packages/react) | React hooks and context factories                                      |
| `@audiorective/clock`                     | Timing, scheduling, transport _(planned)_                              |
| `@audiorective/threejs`                   | Three.js spatial audio integration _(planned)_                         |

Framework-agnostic core. First-class React bindings. Works headless in Node.js.

## Design Principles

- **No state duplication** — AudioProcessor owns all state. UI frameworks observe and mutate directly. No dispatch, no actions, no reducers.
- **Web Audio conventions** — `.value` everywhere, scheduling methods match `AudioParam` 1:1. If you know `gainNode.gain.value`, you know the API.
- **LLM-friendly** — every package ships with agent skills so LLMs can build with audiorective out of the box.
- **Standalone packages** — use what you need. No monolithic framework lock-in.

## Example

[apps/sequencer-poc](./apps/sequencer-poc) — a multi-track step sequencer with melodic synths, kick, snare, and hihat, built with `@audiorective/core` and `@audiorective/react`.

## Status

v0.1.0 — early release. API may change before 1.0.

## License

MIT

## Links

- [GitHub](https://github.com/audiorective/audiorective)
- [@audiorective/core on npm](https://www.npmjs.com/package/@audiorective/core)
- [@audiorective/react on npm](https://www.npmjs.com/package/@audiorective/react)
