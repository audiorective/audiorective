# Audiorective

The wholestack audio primitives.

If you've explored enough Web Audio projects, you'll notice a big missing puzzle piece. Beyond your most valuable audio logic, there are many fundamental problems to solve — state management, coping with UI frameworks, scheduling, to name a few.

Everyone implements their own version of these in slightly different ways. Most end up tightly coupled to specific UI and audio frameworks.

Now it's even worse in the vibe-coding era: ask your AI magician to build something audio on the web, and it will almost certainly start from scratch — or at best reach for Tone.js if you thought to ask.

audiorective aims to solve this — think JUCE-grade infrastructure, but for the web platform. Native audio has mature frameworks that handle audio threading, parameter automation, host communication, and UI binding. Web Audio has nothing equivalent; Tone.js is a music-production library, not a general-purpose audio application framework.

We fill that structural gap with independent, composable packages. Each one solves a specific recurring problem — from reactive state management to scheduling, analysis, and beyond — so you can focus on the exciting part: audio.

What's even better: we also ship agent skill that teaches LLMs how to use audiorective to solve real audio problems correctly. Whether you're a vibe-coder, an AI-assisted session engineer, or a 100% hand-crafting master — we've got you covered.

## Packages

| Package                                       | Description                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [`@audiorective/core`](./packages/core)       | Reactive primitives for Web Audio — Param, AudioProcessor, AudioEngine |
| [`@audiorective/react`](./packages/react)     | React hooks and context factories                                      |
| [`@audiorective/threejs`](./packages/threejs) | Three.js spatial audio integration                                     |
| `@audiorective/clock`                         | Timing, scheduling, transport _(planned)_                              |

Framework-agnostic core. First-class React bindings. Works headless in Node.js.

## Design Principles

- **No state duplication** — AudioProcessor owns all state. UI frameworks observe and mutate directly. No dispatch, no actions, no reducers.
- **Web Audio conventions** — `.value` everywhere, scheduling methods match `AudioParam` 1:1. If you know `gainNode.gain.value`, you know the API.
- **LLM-friendly** — every package ships with agent skills so LLMs can build with audiorective out of the box.
- **Standalone packages** — use what you need. No monolithic framework lock-in.

## Example

[apps/sequencer-poc](./apps/sequencer-poc) — a multi-track step sequencer with melodic synths, kick, snare, and hihat, built with `@audiorective/core`, `@audiorective/react`, and `@audiorective/threejs` (spatial panning in a three.js scene).

## Status

Published packages at v1.1.x. Early release — API may change before 1.0.

## License

MIT

## Links

- [GitHub](https://github.com/audiorective/audiorective)
- [@audiorective/core on npm](https://www.npmjs.com/package/@audiorective/core)
- [@audiorective/react on npm](https://www.npmjs.com/package/@audiorective/react)
- [@audiorective/threejs on npm](https://www.npmjs.com/package/@audiorective/threejs)
