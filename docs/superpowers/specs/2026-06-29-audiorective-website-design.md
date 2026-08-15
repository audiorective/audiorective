# Audiorective Website + Documentation — Design

_Status: approved design, ready for implementation planning. Date: 2026-06-29._

## Goal

A single web app that is the public home of audiorective: a marketing landing
page, the full documentation, and a showroom of demos — all in one deployable
site. The landing page is not just marketing; it is itself an audiorective
application, dogfooding the framework on the homepage.

## Decisions (locked)

| Decision       | Choice                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| App location   | New `apps/web` (picked up by `apps/*` in `pnpm-workspace.yaml`)                                        |
| Stack          | Astro + Starlight + `@astrojs/react`, Vite / React 19, `output: 'static'`                              |
| Deploy         | Static host (Vercel / Netlify), custom domain                                                          |
| Docs source    | Starlight reads the existing `docs/` markdown **in place** — single source of truth                    |
| Demos          | Ported into the site as **native React islands**; old `apps/showroom` + `apps/pixi-visualizer` removed |
| Landing page   | Copy-deck "trailer" content **plus** the full interactive instrument layer                             |
| Lego animation | Canvas 2D faux-2.5D                                                                                    |
| Scheduling     | Uses `@audiorective/clock` (built in parallel) — **external dependency**, not hand-rolled here         |

## Dependencies

- **`@audiorective/clock`** — being developed in parallel as its own package. This
  site does **not** hand-craft a lookahead scheduler. The instrument's looping
  patch and the Clock pain-diagram both consume `@audiorective/clock` for
  sample-accurate scheduling once it lands. Work that depends on it (see phasing)
  is unblocked when the package publishes a usable transport/scheduler API; the
  rest of the site proceeds independently.

The landing-page copy deck is kept at `apps/web/copy/landing-page.md` as the
canonical working document; future refinements are diffed against it.

## Site map

Nav: **logo · Docs · Showroom · GitHub**. No footer, no package grid, no
roadmap on the landing page (per the copy deck — the page is a trailer, not a
manual).

| Route                 | What                                            | Rendering                            |
| --------------------- | ----------------------------------------------- | ------------------------------------ |
| `/`                   | Landing — trailer content + instrument layer    | Astro page + React islands           |
| `/docs/...`           | Full docs, incl. **Get Started / Install** page | Starlight, sourced from `../../docs` |
| `/showroom`           | Gallery with source links                       | Astro page                           |
| `/showroom/livehouse` | Ported Livehouse PA Simulator                   | React island route                   |
| `/showroom/pixi`      | Ported Pixi spectrum visualizer                 | React island route                   |

There is no separate top-level "Quick-start" route. The hero's `Get Started →`
CTA and the skill section's `Install the skill →` CTA both point at the **Get
Started / Install** page inside Docs.

## Landing page

Two layers over one page.

### Layer A — content spine (from the copy deck)

The section order and copy are defined by `apps/web/copy/landing-page.md`.
Rendering strategy: the spine is ~90% static Astro HTML; only the three animated
pieces hydrate as islands, and only when scrolled into view (`client:visible`),
so they "loop quietly" without costing anything above the fold.

1. **Hero** — slogan, `State · Clock · Analysis · Bindings` sub-line, paragraph,
   two CTAs (`Get Started →` → Docs get-started; `View Showroom` → `/showroom`).
   Static.
2. **The problem & the goal** — the thesis. Static.
3. **Pain points** — accordion, one open at a time. Each card: collapsed title +
   one-liner + a quietly looping live diagram; expands to reasoning with the
   diagram still visible. Cards: **State**, **Clock**. Followed by the **Tone.js
   bridge** prose (not a card). Islands (diagrams), `client:visible`.
4. **Composability + baseplate** + the **Lego animation** (looping, generative).
   Island, `client:visible`.
5. **Agent skill — "Sustainable Vibe Coding"** + `Install the skill →` CTA.
   Static.
6. **Closing send-off — "Go make some noise"** — three door CTAs (Showroom,
   Docs, GitHub). No footer. Static.

### Layer B — the instrument (dogfood centerpiece)

The homepage is a live audiorective app. The point it proves: **Astro islands
are independent React roots, yet they all drive one engine, because state lives
in the engine's signals, not in React.** One standalone engine, many UI
contexts, zero duplicated state — the framework's core pitch made literal.

Components:

- **`apps/web/src/instrument/engine.ts`** — a looping patch (drum/synth pattern)
  built on `@audiorective/core`, with scheduling driven by **`@audiorective/clock`**
  (external dependency, see above — no local scheduler). Exported as a **lazy
  module singleton**, created on first user gesture (AudioContext resume).
  Framework-agnostic; not tied to any React context.
- **Floating control islands** (`position: fixed`, persist across scroll) —
  knobs (filter cutoff, tempo, reverb…) and trigger pads hanging at the page
  edges / background. Each is its own island, binding to the singleton via
  `@audiorective/react`.
- **Sticky transport island** — hidden until the hero scrolls out of view
  (IntersectionObserver); then a top bar with **spectrum + waveform**
  visualizers (core `Analyser`) and **play/pause**.
- **Enable-sound affordance** — a tasteful "turn on the sound" control present
  from the top of the page. Audio requires a user gesture and we do not hijack
  the hero CTAs for it; this control doubles as a demonstration of correct
  AudioContext-gesture handling.

The hero copy stays exactly as locked; the instrument is ambient, not a
takeover.

### Synergy: Clock diagram powered by the real scheduler

The Clock pain-diagram reads the **same engine's `@audiorective/clock` scheduler**
rather than a hand-faked timeline — the "problem diagram powered by the solution,"
for real. This is the intended end state and depends on the clock package. Until
it lands, the diagram runs on a faithful standalone simulation of the same
lookahead behaviour, then switches to read the live clock — a swap of the data
source, not a rewrite of the visual.

## Animations

The copy deck is emphatic: the pain diagrams are **"tiny truthful simulations,
not decorative SVG."** No Lottie / pre-baked keyframes for those.

- **State & Clock diagrams** — hand-coded live simulations: a small
  `requestAnimationFrame` / signals-driven model rendered to **SVG** (crisp,
  schematic, labelable). The Clock sim is ultimately powered by
  `@audiorective/clock` (see synergy above; standalone simulation until the
  package lands). Optional muted audio cue via `@audiorective/core`
  (hear drift vs lock).
  - State diagram: two boxes (UI Framework / Audio Engine) showing the same
    value; dragging desyncs them (audio box tinted stale-red), a manual "sync"
    pulse travels across with a visible lag gap; optional beat collapses them
    into one shared node (gap gone).
  - Clock diagram: two stacked timelines (audio clock locked to grid; JS
    `setTimeout` clock jittering, a layout/GC block slamming a beat late);
    resolution beat shows the lookahead placing notes ahead onto the grid.
- **Lego composability loop** — **Canvas 2D faux-2.5D**: lightweight, full
  generative control for the "different piles each loop" variety, minimal page
  weight, no 3D dependency on the landing page. Bricks stay abstract/unlabeled;
  slow, calm pace; the shipped shape very faintly echoes a waveform or play
  button.
- **Page reveals / accordion / hovers** — **Motion for React** (`motion/react`):
  tiny, declarative, island-friendly.

## Documentation

Starlight renders the existing `docs/` markdown in place, keeping a single
source of truth (the same files the agent skill and `AGENTS.md` reference).

Technical approach (to confirm against current Starlight during planning; both
options preserve single-source):

1. A Starlight custom content loader / glob pointed at `../../docs`, **or**
2. A symlink from the site content dir to `../../docs`, plus minimal `title:`
   frontmatter added to each existing doc (harmless to the skill / `AGENTS.md`
   references).

Existing docs to surface: `overview`, `architecture`, `core`, `react`,
`threejs`, `playcanvas`, `pixijs`, `choosing-playback`, `designing-audio-apps`,
plus a new **Get Started / Install** page (install the skill + start crafting;
content adapted from the README's Agent Skill section).

## Showroom

`/showroom` is a gallery of cards. Each card: title, short description,
thumbnail, **View source** (links to the demo's folder on GitHub), **Open demo**
(→ the ported island route). Demos:

- **Livehouse PA Simulator** — ported from `apps/showroom` (React + PlayCanvas +
  three.js). Native island at `/showroom/livehouse`.
- **Pixi spectrum visualizer** — ported from `apps/pixi-visualizer` (core +
  pixi.js). Native island at `/showroom/pixi`.

After porting, `apps/showroom` and `apps/pixi-visualizer` are deleted and the
README "Examples" section + links updated to point at the site routes and the
new source locations.

## Testing

- Engine / scheduler: unit tests (vitest) for the looping patch params and the
  lookahead scheduler.
- Instrument islands: interaction tests via vitest browser (reuse the
  showroom's Playwright browser setup) — play/pause, a knob in one island
  mutating a shared param observed from a _separate_ island, sticky transport
  appearing on scroll.
- Ported demos: bring their existing tests along.
- CI: typecheck + build for `apps/web`.

## Aesthetic

Dark, cyber-livehouse energy consistent with the showroom; neon accents,
monospace for code. Detailed visual direction handled during implementation
(frontend-design).

## Phasing (for the implementation plan)

Each phase ships something usable:

1. Scaffold `apps/web` (Astro + Starlight + React) + nav + docs wired to
   `docs/` + showroom gallery shell + ported demo islands; remove old apps;
   update README.
2. Static landing copy sections (all six) + Motion reveals.
3. Live pain diagrams (State, Clock) + Lego canvas animation.
4. The instrument layer: engine singleton (scheduling via `@audiorective/clock`)
   → floating controls → sticky transport; switch the Clock diagram to read the
   live scheduler. **Depends on `@audiorective/clock` landing.** Phases 1–3 do
   not depend on it and proceed in parallel with the clock package's development;
   if the package is not ready when phase 4 begins, the instrument ships against
   a temporary standalone scheduler and is swapped to the real clock on release.

## Out of scope

- A footer, package catalog/grid, or roadmap on the landing page.
- npm links in the top nav.
- Building the `@audiorective/clock` package — it is a **separate, parallel
  workstream** consumed here as a dependency (see Dependencies).

## Open items

- Exact Starlight external-content mechanism (loader vs symlink) — confirm
  during planning.
- Detailed visual/timing specs for the two pain diagrams and the Lego loop —
  interpreted during implementation from the copy deck's diagram notes.
