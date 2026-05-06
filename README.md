# Audiorective

The wholestack audio primitives.

If you've explored enough Web Audio projects, you'll notice a big missing puzzle piece. Beyond your most valuable audio logic, there are many fundamental problems to solve — state management, coping with UI frameworks, scheduling, to name a few.

Everyone implements their own version of these in slightly different ways. Most end up tightly coupled to specific UI and audio frameworks.

Now it's even worse in the vibe-coding era: ask your AI magician to build something audio on the web, and it will almost certainly start from scratch — or at best reach for Tone.js if you thought to ask.

audiorective aims to solve this — think JUCE-grade infrastructure, but for the web platform. Native audio has mature frameworks that handle audio threading, parameter automation, host communication, and UI binding. Web Audio has nothing equivalent; Tone.js is a music-production library, not a general-purpose audio application framework.

We fill that structural gap with independent, composable packages. Each one solves a specific recurring problem — from reactive state management to scheduling, analysis, and beyond — so you can focus on the exciting part: audio.

What's even better: we also ship an agent skill that teaches LLMs how to use audiorective to solve real audio problems correctly. Whether you're a vibe-coder, an AI-assisted session engineer, or a 100% hand-crafting master — we've got you covered. See [Agent Skill](#agent-skill) below for install instructions.

## Packages

| Package                                       | Description                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [`@audiorective/core`](./packages/core)       | Reactive primitives for Web Audio — Param, AudioProcessor, AudioEngine |
| [`@audiorective/react`](./packages/react)     | React hooks and context factories                                      |
| [`@audiorective/threejs`](./packages/threejs) | Three.js bindings — engine glue, spatial transform sync                |
| `@audiorective/clock`                         | Timing, scheduling, transport _(planned)_                              |

Framework-agnostic core. First-class React bindings. Works headless in Node.js.

## Design Principles

- **No state duplication** — AudioProcessor owns all state. UI frameworks observe and mutate directly. No dispatch, no actions, no reducers.
- **Web Audio conventions** — `.value` everywhere, scheduling methods match `AudioParam` 1:1. If you know `gainNode.gain.value`, you know the API.
- **LLM-friendly** — every package ships with agent skills so LLMs can build with audiorective out of the box.
- **Standalone packages** — use what you need. No monolithic framework lock-in.

## Examples

[apps/showroom](./apps/showroom) — a gallery of demos built with `@audiorective/core`, `@audiorective/react`, and `@audiorective/threejs`:

- **Step Sequencer** — five-track step sequencer with melodic synths, kick, snare, and hihat, plus spatial panning in a three.js scene.
- **Spatial Music Room** — first-person 3D room with a CD player and a positional speaker; turn the camera to hear the panning shift, with transport and 3-band EQ on the player.

## Agent Skill

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
