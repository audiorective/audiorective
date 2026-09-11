---
title: Installation
---

Which `@audiorective/*` packages to install, what they pull in, and how to keep them in step with each other and with the agent skill.

## Packages

| Package                    | Install when you need…                                                                          | Peer dependency         |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| `@audiorective/core`       | Anything at all — `AudioProcessor`, `Param`, `Cell`, `createEngine`, `defineGraph`, the players | —                       |
| `@audiorective/clock`      | Transport, tempo, look-ahead scheduling, rulers (sequencers, drum machines, loopers)            | —                       |
| `@audiorective/effects`    | DSP effects, channel strips, send buses, offline rendering of an effects chain                  | —                       |
| `@audiorective/react`      | React hooks and an engine context                                                               | `react` `^18 \|\| ^19`  |
| `@audiorective/threejs`    | Spatial audio that follows three.js objects                                                     | `three` `>=0.150.0`     |
| `@audiorective/playcanvas` | A shared `AudioContext` and pre/post-panner effects on PlayCanvas `SoundSlot`s                  | `playcanvas` `>=2.18.1` |
| `@audiorective/devtools`   | Measuring and asserting a processor's latency in tests (dev dependency)                         | —                       |

Every package depends on `@audiorective/core`; installing any of them installs core. `core` brings `alien-signals` (the reactive primitive) and `immer` (for `Cell.update`) along with it — you do not install those yourself unless you call `signal`/`computed`/`effect` from `alien-signals` directly in your own code.

## Install

Pick the packages for your stack. A React synth:

```sh
npm install @audiorective/core @audiorective/react
# pnpm add …  /  yarn add …  work the same way
```

A React drum machine with effects:

```sh
npm install @audiorective/core @audiorective/clock @audiorective/effects @audiorective/react
```

Spatial audio in a three.js scene, no React:

```sh
npm install @audiorective/core @audiorective/threejs
```

Latency tests for your own processors:

```sh
npm install -D @audiorective/devtools
```

Install the framework peer (`react`, `three`, `playcanvas`) yourself if the project doesn't have it already; the binding packages don't bundle it.

## Keep versions aligned

All `@audiorective/*` packages are released together under one version number. Install and upgrade them as a set so their internal types agree:

```sh
npm install @audiorective/core@latest @audiorective/clock@latest @audiorective/react@latest
```

To see what is actually installed (the resolved version, not the range in `package.json`):

```sh
node -p "require('@audiorective/core/package.json').version"
```

Compare that against `CHANGELOG.md` when an API described in the docs is missing or has a different shape — the package is probably older than the docs. Upgrade rather than reimplementing the missing API.

## Environment requirements

- **A browser with the Web Audio API.** `createEngine` constructs a real `AudioContext` eagerly. There is no server-side mode; in Next.js, Remix, or Astro, mount the audio subtree behind a client-only boundary. See [Server-rendered Frameworks](./client-boundary.md).
- **TypeScript projects need the DOM lib** (`"lib": ["DOM", …]` in `tsconfig.json`) so `AudioContext`, `GainNode`, and `AudioParam` types resolve. Most front-end templates already have it.
- **Node.js and jsdom** have no `AudioContext`. Headless tests run in a real browser (the packages themselves use vitest browser mode), or pass a context you construct or mock: `createEngine(setup, { context })`.
- **AudioWorklet-backed effects** (`Compressor`, `Limiter`, `PitchShift` with the `stretch` engine) load their worklet module from a Blob URL at first construction, so they need no bundler configuration or copied assets. They throw `WorkletUnavailableError` on a context without `audioWorklet`.

## One reactive graph, one copy of `alien-signals`

An `effect()` from one copy of `alien-signals` cannot track a signal created by another, so a duplicated copy makes the UI silently stop updating with no error thrown. This happens with linked or vendored packages and with lockfiles that failed to dedupe. Check with `npm ls alien-signals` (or `pnpm why alien-signals`); if two versions appear, deduplicate or alias the package in your bundler — alias the entry file, not the directory, since the package is exports-only.

## Don't reach for a second audio framework

audiorective covers state, scheduling, effects, and framework bindings. Adding Tone.js alongside it for effects or transport puts two schedulers and two `AudioContext` owners in one app; use `@audiorective/effects` and `@audiorective/clock` instead. Plain Web Audio nodes are always fine to mix in — a processor is just a class that owns them.

## The agent skill

The skill in `skills/` installs separately from the npm packages:

```sh
npx skills add audiorective/audiorective
```

or as a Claude Code plugin from the `audiorective/audiorective` marketplace. Because the two install through different channels they can drift; the skill's own "Version mismatches" section explains how to detect that from inside a session.
