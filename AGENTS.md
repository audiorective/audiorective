# Audiorective — Agent Instructions

Modular toolkit for web audio development. Independent, composable packages that work alone or together.

## Documentation Tiers

- `AGENTS.md` (this file) — contributor conventions for working in this repo
- `docs/` — full API reference per package, also rendered on the site
- `skills/` — consumer-facing skills (install via `npx skills add audiorective/audiorective`): `audiorective` for building apps, `audio-processor-authoring` for writing processors. See "Skills" below.
- `evals/` — trigger and functional test sets for the skills

## Monorepo Structure

```
@audiorective/
├── core         # Reactive state for audio parameters (alien-signals)
├── react        # React bindings
└── threejs      # Three.js bindings (engine glue, scene transform sync)
```

## Core Conventions

### The `.value` Pattern

Matches native Web Audio API. Wraps alien-signals internally:

```typescript
synth.params.volume.value = 0.5; // set (calls signal internally)
synth.params.volume.linearRampToValueAtTime(1, time); // schedule — same as native AudioParam
```

### Signal Exposure via `$`

Raw alien-signals function exposed for advanced/framework use:

```typescript
synth.params.volume.value; // .value getter/setter (tracked by effects)
synth.params.volume.$(); // raw signal read (also tracked)
synth.params.volume.$(0.8); // raw signal write
```

### Build helpers — `param`, `schedulableParam`, `cell`

Subclasses pass a build callback to `super()` that returns the typed `params` (and optional `cells`) registry. The callback receives helpers that already know about the AudioContext and the processor's internal silencer:

```typescript
class Synth extends AudioProcessor<{
  bpm: Param<number>;
  volume: SchedulableParam;
  waveform: Param<OscType>;
}> {
  constructor(ctx: AudioContext) {
    const gain = new GainNode(ctx);
    const osc = new OscillatorNode(ctx);
    super(ctx, ({ param }) => ({
      params: {
        bpm: param({ default: 120 }), // JS scheduling (~16ms)
        volume: param({ default: 0.5, bind: gain.gain }), // native scheduling (sample-accurate)
        waveform: param<OscType>({
          // reactive sync to property
          default: "sine",
          bind: { get: () => osc.type, set: (v) => (osc.type = v) },
        }),
      },
    }));
  }
  // ...
}
```

Audio nodes are constructed as **locals** before `super()` so the callback can close over them. Anything you also need on `this` (e.g. `this.osc` for `playNote`) gets assigned after `super()` returns.

## `bind` Rules

| Shape          | When to use                     | Result                                       |
| -------------- | ------------------------------- | -------------------------------------------- |
| No `bind`      | Pure JS state (flags, arrays)   | `Param<T>`                                   |
| `AudioParam`   | Controls a Web Audio node param | `SchedulableParam` (native, sample-accurate) |
| `{ get, set }` | Sync to non-AudioParam property | `Param<T>` with reactive effect              |

The `schedulableParam` helper (without `bind`) creates a `SchedulableParam` backed by a phantom ConstantSourceNode — useful when you want scheduling without a real AudioParam (e.g., BPM).

## Scheduling Model

|           | `param({ bind: audioParam })` | `schedulableParam({})` (no bind)                  | `param({})` (no bind)  |
| --------- | ----------------------------- | ------------------------------------------------- | ---------------------- |
| Type      | `SchedulableParam`            | `SchedulableParam`                                | `Param<T>`             |
| Thread    | Audio                         | Audio (ConstantSourceNode)                        | Main                   |
| Precision | Sample-accurate               | Sample-accurate                                   | Immediate              |
| Use for   | Gain, frequency, filter       | BPM, intensity — anything needing scheduled ramps | Flags, arrays, strings |

**AudioParam sync strategy:** For native-backed params, scheduling methods delegate to the real AudioParam. A rAF poll reads `AudioParam.value` back into the signal so UI stays reactive during automations.

## Design Rules

1. **Web Audio API consistency** — `.value` pattern everywhere
2. **Signal exposure** — always expose `$` for raw signal access
3. **Method-based API** — `param()`, not decorators. Clear, type-safe, discoverable
4. **Automatic dependency tracking** — no manual dep arrays. Effects/computed auto-track
5. **`reactiveParam` for standalone use** — same `.value` API without AudioProcessor inheritance
6. **Graph helpers** — `defineGraph` wires an audio graph from a reactive edge list of direct node/processor references (no string keys), diffs it on every change, and compensates join-point latency automatically (PDC)
7. **Framework agnostic** — core works in Node.js, React, Vue, Svelte, vanilla
8. **No state duplication** — AudioProcessor owns all state. UI frameworks observe/mutate directly. No separate store.
9. **Unified SchedulableParam** — one type regardless of backing. `bind` with AudioParam is an internal optimization, not a type distinction.

## AudioProcessor Base Class

All processors extend `AudioProcessor<P, C>` with explicit registry generics:

- Must implement `get output(): AudioNode | undefined`
- Constructor passes a build callback to `super()` that returns `{ params, cells? }`
- Exposes typed `processor.params` (frozen) and `processor.cells` (frozen) registries
- Instance methods `computed()` and `effect()` for derived values declared after `super()`
- `destroy()` cleans up effects, params, and ConstantSources

## Package Dependencies

- `core`: depends on `alien-signals`
- `react`: depends on `core`, peer-depends on `react`
- `threejs`: depends on `core`, peer-depends on `three`

## Skills

The skills are the product's front door for agents, so they're maintained like public API.

**Layout.** Each skill is `skills/<name>/SKILL.md` plus `references/`. Reference files are **symlinks into `docs/`** (and `CHANGELOG.md`), never copies — a doc change is a skill change with no second edit. To give a skill a new reference: write `docs/<topic>.md` with a `title` frontmatter, add it to the sidebar in `apps/web/astro.config.mjs`, then `ln -s ../../../docs/<topic>.md skills/<skill>/references/<topic>.md` and route to it from the skill's "What to read next" table.

**SKILL.md shape.** Frontmatter has `name`, `description`, `license`, `compatibility`. The body is task-oriented and loads whole when the skill triggers, so it has a budget: keep `SKILL.md` under 300 lines, and keep each section to what fits on one screen — a setup pointer, a runnable quick start, the routing tables, the rules that always apply, a common-errors table, and a references list. Anything deeper (full API surface, long walkthroughs, rationale) belongs in a reference doc that is loaded only when a task needs it. The `description` is the only thing an agent sees before deciding to open the skill — state what it does and the concrete situations that should trigger it, including ones where the user never names audiorective.

**Evergreen.** Docs and skills describe current behaviour in the present tense. Release history — "added in", "now supports", "previously", version numbers — goes in `CHANGELOG.md`, which the skill reads only to diagnose version drift. When a public API changes: update the doc, add the changelog entry, and update or add the eval in `evals/` that exercises it, in the same PR.

**Errors are documentation.** A new thrown error should have a row in the skill's "Common errors" table (symptom → cause → fix) with the message text an agent will actually see.

**Evals.** `evals/<skill>/trigger_eval.json` checks the description fires for the right requests and stays quiet for near-misses; `evals/<skill>/evals.json` checks output quality with verifiable expectations. Run them after editing a description or a rule (`evals/README.md`).

## Releasing

- All packages version together via `pnpm release` (`bumpp -r --all`).
- When a release adds, changes, or removes a public API, add an entry to
  `CHANGELOG.md` under the new version. The skill ships this file (symlinked at
  `skills/audiorective/references/changelog.md`) so agents can detect when an
  installed package predates a documented API.
- `.claude-plugin/plugin.json` has its own `version`, and `bumpp` does not
  touch it. Bump it by hand whenever skill content changes (minor for new
  guidance, patch for corrections) so plugin installs see an update, and lift
  it to the package version at a release if it has fallen behind.
