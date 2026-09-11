# Audiorective

The wholestack audio primitives.

If you've explored enough Web Audio projects, you'll notice a big missing puzzle piece. Beyond your most valuable audio logic, there are many fundamental problems to solve — state management, coping with UI frameworks, scheduling, to name a few.

Everyone implements their own version of these in slightly different ways. Most end up tightly coupled to specific UI and audio frameworks.

Now it's even worse in the vibe-coding era: ask your AI magician to build something audio on the web, and it will almost certainly start from scratch — or at best reach for Tone.js if you thought to ask.

audiorective aims to solve this — think JUCE-grade infrastructure, but for the web platform. Native audio has mature frameworks that handle audio threading, parameter automation, host communication, and UI binding. Web Audio has nothing equivalent; Tone.js is a music-production library, not a general-purpose audio application framework.

We fill that structural gap with independent, composable packages. Each one solves a specific recurring problem — from reactive state management to scheduling, analysis, and beyond — so you can focus on the exciting part: audio.

What's even better: we also ship an agent skill that teaches LLMs how to use audiorective to solve real audio problems correctly. Whether you're a vibe-coder, an AI-assisted session engineer, or a 100% hand-crafting master — we've got you covered. See [Agent Skill](#agent-skill) below for install instructions.

## Packages

| Package                                             | Description                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`@audiorective/core`](./packages/core)             | Reactive primitives for Web Audio — Param, AudioProcessor, AudioEngine, Sampler, BufferPlayer, FilePlayer |
| [`@audiorective/react`](./packages/react)           | React hooks and context factories                                                                         |
| [`@audiorective/threejs`](./packages/threejs)       | Three.js bindings — engine glue, spatial transform sync                                                   |
| [`@audiorective/playcanvas`](./packages/playcanvas) | PlayCanvas bindings — shared AudioContext + pre/post-panner FX on SoundSlot                               |
| [`@audiorective/clock`](./packages/clock)           | Timing and scheduling engine — transport, tempo, look-ahead tick windows, rulers                          |
| [`@audiorective/effects`](./packages/effects)       | DSP effects and channel/send plumbing — the Tone.js replacement set                                       |

Framework-agnostic core. First-class React bindings. Works headless in Node.js.

## Design Principles

- **No state duplication** — AudioProcessor owns all state. UI frameworks observe and mutate directly. No dispatch, no actions, no reducers.
- **Web Audio conventions** — `.value` everywhere, scheduling methods match `AudioParam` 1:1. If you know `gainNode.gain.value`, you know the API.
- **LLM-friendly** — every package ships with agent skills so LLMs can build with audiorective out of the box.
- **Standalone packages** — use what you need. No monolithic framework lock-in.

## Examples

[apps/web/src/demos/livehouse](./apps/web/src/demos/livehouse) — **Livehouse PA Simulator**, one app built with `@audiorective/core`, `@audiorective/react`, `@audiorective/playcanvas`, and three.js: you're the PA tech in a cyber livehouse. Six audio drones (FilePlayer stems, a synth, and a Sampler for the pads) fly in a PlayCanvas world; walk around to hear the spatial mix shift, mix each channel (EQ / volume / solo / mute / 3D pan) from a React iPad HUD, fire the sampler pads, and hit Headphone to monitor a dry stereo mixdown. Demonstrates the full stack: one `AudioContext`, three renderers, zero duplicated audio state. Runs at `/showroom/livehouse` on the site.

[apps/web/src/demos/sequencer](./apps/web/src/demos/sequencer) — a 16-step **drum machine** built with `@audiorective/clock`, `@audiorective/core`, and `@audiorective/react`. One `grid(patternLength)` loop over a `CycleBarRuler` schedules the whole pattern; transport, tempo, and live step edits all go through the clock. Its output runs through a latency lab — a `defineGraph` splitting the signal into a lookahead-limited path and a dry path, with plugin delay compensation, bypass, and a live graph diagram — and the playhead reads the ruler at the time the listener is hearing. The reference consumer for [docs/clock.md](./docs/clock.md) and for `defineGraph`'s latency compensation. Runs at `/showroom/sequencer` on the site.

[apps/web/src/demos/pixi](./apps/web/src/demos/pixi) — a minimal **PixiJS** spectrum visualizer built with only `@audiorective/core`, `alien-signals`, and `pixi.js`. Shows that a 2D canvas renderer needs no binding package: the core `Analyser` feeds per-frame spectrum bars, an `effect()` drives a signal-reactive glow, and pointer drags write params directly (with the UI-owned `level` kept separate from the ramped `gate` envelope). See [docs/pixijs.md](./docs/pixijs.md). Runs at `/showroom/pixi` on the site.

[apps/web/src/demos/fx-rack](./apps/web/src/demos/fx-rack) — an **effects processor** and offline export engine built with `@audiorective/effects`, `@audiorective/core`, and `@audiorective/react`. Route drum stems and pads through five inserts (pitch shift, filter, frequency shifter, distortion, phaser) and two sends (delay, reverb) into dynamics (compressor and limiter). Switch pitch-shift engines live while the graph recomputes latencies and applies PDC; watch reduction meters animate; toggle wet/dry without disconnecting; export 4 bars as a WAV through `renderOffline`. The same `FxRack` class runs the live demo and offline renders. Runs at `/showroom/fx-rack` on the site.

## Agent Skills

audiorective ships agent skills that follow the [Agent Skills specification](https://agentskills.io/specification), so any compatible coding agent can use them.

| Skill                                                             | Use it for                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`audiorective`](./skills/audiorective)                           | Building audio apps with the packages — quick start, package selection, audio/UI separation, client-only boundaries, common errors, API references |
| [`audio-processor-authoring`](./skills/audio-processor-authoring) | Writing or reviewing an `AudioProcessor` subclass — skeleton, params and cells, `defineGraph`, latency, `destroy`, headless tests                  |

Each skill's `references/` folder mirrors [`docs/`](./docs), so the skill and the site never disagree. Trigger and functional test sets live in [`evals/`](./evals).

### Any agent (Claude Code, Cursor, OpenCode, Cline, …)

Install with the [Vercel skills CLI](https://github.com/vercel-labs/skills):

```sh
npx skills add audiorective/audiorective
```

The CLI auto-detects whichever agent you have installed and writes the skill into the right place.

### Claude Code plugin

audiorective also ships as a [Claude Code plugin](https://code.claude.com/docs/en/plugins). Add this repo as a marketplace, then install the plugin from it.

**CLI**

```sh
/plugin marketplace add audiorective/audiorective
/plugin install audiorective@audiorective
```

**Claude Desktop (Code or Cowork tab)**

1. Click **Customize** in the sidebar
2. Click the **+** button in the **Personal Skills** section → **Add Marketplace**
3. Enter `audiorective/audiorective`
4. Install the audiorective plugin from the browser

Full reference: [Discover and install plugins](https://code.claude.com/docs/en/discover-plugins).

## License

MIT

## Links

- [GitHub](https://github.com/audiorective/audiorective)
- [@audiorective/core on npm](https://www.npmjs.com/package/@audiorective/core)
- [@audiorective/react on npm](https://www.npmjs.com/package/@audiorective/react)
- [@audiorective/threejs on npm](https://www.npmjs.com/package/@audiorective/threejs)
- [@audiorective/playcanvas on npm](https://www.npmjs.com/package/@audiorective/playcanvas)
- [@audiorective/clock on npm](https://www.npmjs.com/package/@audiorective/clock)
