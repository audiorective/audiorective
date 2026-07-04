# Audiorective Website + Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/web` — a single Astro site that is audiorective's landing page, documentation, and demo showroom, where the landing page is itself a live audiorective app.

**Architecture:** Astro (static output) with Starlight for docs and `@astrojs/react` islands for every interactive/audio surface. Docs render the repo's existing `docs/` markdown in place (single source of truth). The two existing demo apps are ported into the site as React-island routes and their standalone app folders removed. The landing page layers an interactive "instrument" (one `@audiorective/core` engine, exported as a module singleton) beneath the copy-deck content; scattered island controls all drive that one engine — proving the framework's "one engine, many UI contexts, zero duplicated state" thesis literally on the homepage.

**Tech Stack:** Astro 5/6 (static), Starlight, `@astrojs/react`, React 19, TypeScript 5.9, `motion` (Motion for React), `@audiorective/core`, `@audiorective/react`, `@audiorective/clock` (external dependency, in parallel development), `alien-signals`, `pixi.js`, `playcanvas`, `three`, Vite, Vitest (+ `@vitest/browser` Playwright).

## Global Constraints

Every task's requirements implicitly include this section.

- **Package manager:** pnpm 9.15.3 (`"packageManager": "pnpm@9.15.3"`). Workspace globs already include `apps/*` — no `pnpm-workspace.yaml` edit needed for `apps/web`.
- **Build output:** Astro `output: 'static'`. Deploy target is a static host (Vercel/Netlify). No SSR adapter.
- **Package name:** the new app is `@audiorective/web`, `"private": true`, `"type": "module"`.
- **Nav is exactly:** `logo · Docs · Showroom · GitHub`. No npm link, no Quick-start route. (Copy deck §2.)
- **Landing page forbidden elements:** no footer, no package list/grid, no roadmap. (Copy deck §2.)
- **Locked copy is verbatim.** All landing copy comes from `apps/web/copy/landing-page.md` — copy strings exactly, never paraphrase locked (✅) sections.
- **Docs are single-source.** The Starlight `docs` collection reads `../../docs` (repo root `docs/`) — never duplicate doc bodies into `apps/web`.
- **Cross-island state rule:** islands MUST NOT attempt to share React state/context across separate island roots. Shared audio state lives in the `engine` module singleton (`apps/web/src/instrument/engine.ts`); each island imports it and subscribes via `useValue`. This is a load-bearing demonstration, not an accident — do not "fix" it by hoisting a provider over the whole page.
- **Aesthetic:** dark, "cyber-livehouse" energy consistent with the showroom; neon accents; monospace for code. Apply the `frontend-design` skill on visual tasks.
- **Assumed `@audiorective/clock` contract** (finalize against the real package when it lands; see Task 4.0):
  ```ts
  import type { SchedulableParam, Readable } from "@audiorective/core";
  export class Transport {
    constructor(ctx: BaseAudioContext, opts?: { bpm?: number; lookahead?: number; interval?: number });
    readonly bpm: SchedulableParam; // .value / scheduling methods
    readonly isPlaying: Readable<boolean>; // subscribe via useValue
    start(): void;
    stop(): void;
    /** Schedule cb on a repeating grid. cb receives the sample-accurate audio time. Returns an unschedule fn. */
    every(interval: "4n" | "8n" | "16n" | number, cb: (time: number, step: number) => void): () => void;
    destroy(): void;
  }
  ```

## Verified API reference (from existing source — use these exact names)

- `@audiorective/core`:
  - `createEngine<T>(setup: (ctx: AudioContext) => T, options?): T & { core: AudioEngine }` — auto-registers any `AudioProcessor` returned.
  - `AudioEngine`: `.context`, `.state: SignalAccessor<EngineState>` (`"idle"|"running"|"suspended"|"destroyed"`), `.start()`, `.suspend()`, `.resume()`, `.autoStart(target, options?): () => void`, `.destroy()`.
  - `Analyser`: `new Analyser(ctx, { fftSize?, smoothingTimeConstant?, minDecibels?, maxDecibels? })`; `.input`, `.output`, `.binCount`, `createFrequencyBuffer(): Uint8Array`, `createWaveformBuffer(): Uint8Array`, `readFrequencies(out)`, `readWaveform(out)`.
  - `AudioProcessor<P, C>`: constructor `(ctx, build: (helpers) => { params: P; cells?: C })`; helpers `param`, `schedulableParam`, `cell`; protected `computed`, `effect`; must implement `get output()`.
  - `Param<T>`: `.value` get/set, `.$: SignalAccessor<T>`, optional `.min/.max/.step/.label/.display()`.
  - `SchedulableParam extends Param<number>`: `setValueAtTime`, `linearRampToValueAtTime`, `exponentialRampToValueAtTime`, `setTargetAtTime`, `cancelScheduledValues`.
  - `Sampler`: `new Sampler(ctx, { buffer?, loop?, playbackRate?, volume?, polyphony?, steal? })`; `.trigger(opts?): Voice | null`; `.output`.
  - `interface Readable<T> { readonly $: SignalAccessor<T>; readonly value: T }`.
- `@audiorective/react` (only two exports):
  - `useValue<T>(source: Readable<T> | ComputedAccessor<T>): T`
  - `createEngineContext<T extends { core: AudioEngine }>(engine: T): { EngineProvider, useEngine }`
- `alien-signals`: `signal(initial)`, `effect(fn): () => void`, `computed(fn)`.

---

# Phase 1 — Scaffold, docs, showroom, ported demos

Deliverable: a deployable site with working nav, docs rendered from `docs/`, a showroom gallery, both demos running as island routes, and the old demo apps removed.

### Task 1.1: Scaffold `apps/web`

**Files:**

- Create: `apps/web/package.json`, `apps/web/astro.config.mjs`, `apps/web/tsconfig.json`, `apps/web/src/layouts/BaseLayout.astro`, `apps/web/src/components/SiteNav.astro`, `apps/web/src/pages/index.astro` (placeholder), `apps/web/public/favicon.svg`
- Modify: none (workspace already globs `apps/*`)

**Interfaces:**

- Produces: `BaseLayout.astro` (props `{ title: string; description?: string }`, wraps `<slot/>` with `<SiteNav/>`); `SiteNav.astro` (renders logo · Docs · Showroom · GitHub).

- [ ] **Step 1: Scaffold via official CLI** (pins current versions)

```bash
cd apps
pnpm create astro@latest web -- --template minimal --no-install --no-git --typescript strict --skip-houston
cd web
pnpm astro add react starlight --yes
```

Expected: `apps/web` created; `@astrojs/react`, `@astrojs/starlight` added to `package.json`; `astro.config.mjs` updated with integrations.

- [ ] **Step 2: Set package identity**

Edit `apps/web/package.json` — set `"name": "@audiorective/web"`, `"private": true`, `"type": "module"`. Add workspace deps:

```json
"dependencies": {
  "@audiorective/core": "workspace:*",
  "@audiorective/react": "workspace:*",
  "alien-signals": "^3.1.2",
  "motion": "^11.11.0"
}
```

Then from repo root: `pnpm install`.

- [ ] **Step 3: Configure static output + integrations** in `apps/web/astro.config.mjs`

```js
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

export default defineConfig({
  output: "static",
  site: "https://audiorective.dev",
  integrations: [
    starlight({
      title: "Audiorective",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/audiorective/audiorective" }],
      // sidebar + content wiring added in Task 1.2
    }),
    react(),
  ],
});
```

- [ ] **Step 4: Base layout + nav**

`apps/web/src/layouts/BaseLayout.astro`:

```astro
---
import SiteNav from '../components/SiteNav.astro';
interface Props { title: string; description?: string }
const { title, description } = Astro.props;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
  </head>
  <body>
    <SiteNav />
    <slot />
  </body>
</html>
```

`apps/web/src/components/SiteNav.astro`:

```astro
---
const links = [
  { label: 'Docs', href: '/docs/overview' },
  { label: 'Showroom', href: '/showroom' },
  { label: 'GitHub', href: 'https://github.com/audiorective/audiorective' },
];
---
<nav class="site-nav">
  <a class="brand" href="/">audiorective</a>
  <ul>{links.map((l) => <li><a href={l.href}>{l.label}</a></li>)}</ul>
</nav>
```

- [ ] **Step 5: Placeholder home** `apps/web/src/pages/index.astro`

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Audiorective" description="Delightful Web Audio primitives.">
  <main><h1>Audiorective</h1></main>
</BaseLayout>
```

- [ ] **Step 6: Verify dev + build**

Run: `pnpm --filter @audiorective/web build`
Expected: build succeeds, emits `apps/web/dist`. (Do NOT start a long-running dev server in this environment; the user runs dev servers.)

- [ ] **Step 7: Commit**

```bash
git add apps/web && git commit -m "feat(web): scaffold Astro + Starlight + React site shell"
```

---

### Task 1.2: Wire docs collection to repo `docs/`

**Files:**

- Create: `apps/web/src/content.config.ts`
- Modify: `apps/web/astro.config.mjs` (Starlight sidebar), each of `docs/overview.md`, `docs/architecture.md`, `docs/core.md`, `docs/react.md`, `docs/threejs.md`, `docs/playcanvas.md`, `docs/pixijs.md`, `docs/choosing-playback.md`, `docs/designing-audio-apps.md` (add `title` frontmatter)

**Interfaces:**

- Produces: a `docs` content collection whose entries are the repo docs (excluding `superpowers/`), rendered by Starlight at `/docs/<slug>`.

**Mechanism (primary): custom `glob()` loader with external base + exclude.** Starlight renders any `docs` collection built with `docsSchema()`, regardless of loader. This keeps `docs/` in place with no symlinks and auto-syncs new files.
**Fallback (only if the glob base is rejected at build):** create per-file symlinks `apps/web/src/content/docs/<name>.md -> ../../../../docs/<name>.md` and use the default `docsLoader()`. Same `docsSchema()`, same frontmatter requirement.

- [ ] **Step 1: Add `title` frontmatter to each rendered doc**

Starlight's `docsSchema()` requires `title`. Prepend to each file listed above a frontmatter block using the doc's existing H1 text, e.g. `docs/core.md`:

```md
---
title: Core
---
```

Map: overview→"Overview", architecture→"Architecture", core→"Core", react→"React", threejs→"Three.js", playcanvas→"PlayCanvas", pixijs→"PixiJS", choosing-playback→"Choosing Playback", designing-audio-apps→"Designing Audio Apps". Leave the existing `# H1` in the body (Starlight tolerates a duplicate H1; optionally delete the now-redundant H1 line per file). Do **not** touch `docs/superpowers/**`.

- [ ] **Step 2: Content config with external glob**

`apps/web/src/content.config.ts`:

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

export const collections = {
  docs: defineCollection({
    loader: glob({ pattern: ["**/*.{md,mdx}", "!superpowers/**"], base: "../../docs" }),
    schema: docsSchema(),
  }),
};
```

- [ ] **Step 3: Configure sidebar** in `astro.config.mjs` `starlight({ ... })`

```js
sidebar: [
  { label: 'Start', items: [
    { label: 'Overview', slug: 'overview' },
    { label: 'Get Started', slug: 'get-started' }, // created in Task 1.3
  ]},
  { label: 'Concepts', items: [
    { label: 'Architecture', slug: 'architecture' },
    { label: 'Designing Audio Apps', slug: 'designing-audio-apps' },
    { label: 'Choosing Playback', slug: 'choosing-playback' },
  ]},
  { label: 'Packages', items: [
    { label: 'Core', slug: 'core' },
    { label: 'React', slug: 'react' },
    { label: 'Three.js', slug: 'threejs' },
    { label: 'PlayCanvas', slug: 'playcanvas' },
    { label: 'PixiJS', slug: 'pixijs' },
  ]},
],
```

- [ ] **Step 4: Verify docs build + exclusion**

Run: `pnpm --filter @audiorective/web build`
Expected: build succeeds; `apps/web/dist/docs/core/index.html` etc. exist; **no** page generated under `dist/docs/superpowers/`. Confirm with:

```bash
ls apps/web/dist/docs && test ! -d apps/web/dist/docs/superpowers && echo "superpowers excluded OK"
```

If the build errors on the external `base`, apply the symlink fallback (Interfaces note) and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/web docs/*.md && git commit -m "feat(web): render repo docs in place via Starlight"
```

---

### Task 1.3: Get Started / Install doc page

**Files:**

- Create: `docs/get-started.md`

**Interfaces:**

- Produces: `/docs/get-started` — the target of the hero `Get Started →` and skill `Install the skill →` CTAs.

- [ ] **Step 1: Author the page** (content adapted from `README.md` "Agent Skill" section — install via Vercel skills CLI + Claude Code plugin — plus a minimal "start crafting" core example)

`docs/get-started.md`:

````md
---
title: Get Started
---

## Install the skill

Any agent (Claude Code, Cursor, OpenCode, Cline, …):

```sh
npx skills add audiorective/audiorective
```
````

Claude Code plugin:

```sh
/plugin marketplace add audiorective/audiorective
/plugin install audiorective@audiorective
```

## Start crafting

```sh
pnpm add @audiorective/core
```

```ts
import { createEngine } from "@audiorective/core";
// … minimal synth example (mirror docs/core.md's first example) …
```

````
Pull the exact minimal example from `docs/core.md` so it stays correct. Verify build; commit `git add docs/get-started.md && git commit -m "docs: add Get Started / Install page"`.

---

### Task 1.4: Showroom gallery page

**Files:**
- Create: `apps/web/src/data/demos.ts`, `apps/web/src/pages/showroom/index.astro`, `apps/web/src/components/DemoCard.astro`

**Interfaces:**
- Produces: `interface Demo { slug: string; title: string; blurb: string; thumb: string; route: string; source: string; packages: string[] }`; `export const demos: Demo[]`.
- Consumes: nothing yet (routes filled by 1.5/1.6).

- [ ] **Step 1: Demo manifest** `apps/web/src/data/demos.ts`

```ts
export interface Demo {
  slug: string;
  title: string;
  blurb: string;
  thumb: string;   // path under /public
  route: string;   // internal route
  source: string;  // GitHub URL
  packages: string[];
}
export const demos: Demo[] = [
  {
    slug: 'livehouse',
    title: 'Livehouse PA Simulator',
    blurb: "You're the PA tech in a cyber livehouse: six spatial audio drones in a PlayCanvas world, mixed from a React iPad HUD.",
    thumb: '/showroom/livehouse.jpg',
    route: '/showroom/livehouse',
    source: 'https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/livehouse',
    packages: ['@audiorective/core', '@audiorective/react', '@audiorective/playcanvas', 'three'],
  },
  {
    slug: 'pixi',
    title: 'Pixi Spectrum Visualizer',
    blurb: 'A minimal PixiJS spectrum visualizer built on only the core Analyser — no binding package required.',
    thumb: '/showroom/pixi.jpg',
    route: '/showroom/pixi',
    source: 'https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/pixi',
    packages: ['@audiorective/core', 'pixi.js'],
  },
];
````

- [ ] **Step 2: `DemoCard.astro`** — props `Demo`; renders thumb, title, blurb, package tags, `Open demo →` (`route`) and `View source` (`source`).

- [ ] **Step 3: Gallery page** `apps/web/src/pages/showroom/index.astro` — imports `demos`, maps to `<DemoCard>`, wrapped in `BaseLayout title="Showroom"`.

- [ ] **Step 4: Placeholder thumbnails** — add `apps/web/public/showroom/livehouse.jpg` and `pixi.jpg` (screenshots captured after 1.5/1.6; commit a placeholder now, replace later).

- [ ] **Step 5: Verify build + commit**

Run `pnpm --filter @audiorective/web build`; expected `dist/showroom/index.html` exists. `git add apps/web && git commit -m "feat(web): showroom gallery"`.

---

### Task 1.5: Port pixi-visualizer as an island route

**Files:**

- Create: `apps/web/src/demos/pixi/` (move source from `apps/pixi-visualizer/src/`), `apps/web/src/demos/pixi/PixiVisualizer.tsx` (React wrapper), `apps/web/src/pages/showroom/pixi.astro`
- Modify: `apps/web/package.json` (add `pixi.js`)

**Interfaces:**

- Consumes: `@audiorective/core` (`createEngine`, `Analyser`, `effect` from `alien-signals`).
- Produces: `PixiVisualizer` default React component that mounts the pixi app into a container ref and disposes on unmount.

The current pixi app is vanilla (`main.ts` + `audio/engine.ts`). Porting = keep the audio/engine + pixi setup, wrap the imperative mount in a React effect.

- [ ] **Step 1: Move source**

```bash
mkdir -p apps/web/src/demos/pixi
git mv apps/pixi-visualizer/src/* apps/web/src/demos/pixi/
```

Add `"pixi.js": "^8.6.6"` to `apps/web/package.json`; `pnpm install`.

- [ ] **Step 2: Extract mount fn** — refactor the current `main.ts` body into an exported `export async function mountPixi(container: HTMLElement): Promise<() => void>` that creates the `pixi.Application`, runs `engine.core.autoStart(container)`, wires the ticker/effects, and returns a dispose fn (destroy pixi app + call autoStart dispose + `engine.core.destroy()`). Keep `audio/engine.ts` untouched.

- [ ] **Step 3: React wrapper** `PixiVisualizer.tsx`

```tsx
import { useEffect, useRef } from "react";
import { mountPixi } from "./main";

export default function PixiVisualizer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let dispose = () => {};
    let alive = true;
    mountPixi(ref.current).then((d) => {
      if (alive) dispose = d;
      else d();
    });
    return () => {
      alive = false;
      dispose();
    };
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100dvh" }} />;
}
```

- [ ] **Step 4: Route** `apps/web/src/pages/showroom/pixi.astro`

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import PixiVisualizer from '../../demos/pixi/PixiVisualizer.tsx';
---
<BaseLayout title="Pixi Spectrum Visualizer">
  <PixiVisualizer client:only="react" />
</BaseLayout>
```

- [ ] **Step 5: Verify build + commit**

Run `pnpm --filter @audiorective/web build`; expected `dist/showroom/pixi/index.html`. `git add -A && git commit -m "feat(web): port pixi visualizer as island route"`.

---

### Task 1.6: Port showroom (Livehouse) as an island route

**Files:**

- Create: `apps/web/src/demos/livehouse/` (move `apps/showroom/src/`), `apps/web/src/pages/showroom/livehouse.astro`
- Modify: `apps/web/package.json` (add `@audiorective/playcanvas`, `playcanvas`, `three`, `@types/three`), move `apps/showroom/public/*` → `apps/web/public/`

**Interfaces:**

- Consumes: `@audiorective/core`, `@audiorective/react` (`EngineProvider`), `@audiorective/playcanvas`, `three`.
- Produces: `LivehouseApp` default React component (the current `<App/>`), mountable via `client:only="react"`.

- [ ] **Step 1: Move source + assets**

```bash
mkdir -p apps/web/src/demos/livehouse
git mv apps/showroom/src/* apps/web/src/demos/livehouse/
git mv apps/showroom/public/* apps/web/public/
```

Add to `apps/web/package.json`: `@audiorective/playcanvas": "workspace:*"`, `playcanvas": "^2.18.1"`, `three": "^0.182.0"`, dev `@types/three": "^0.182.0"`. `pnpm install`.

- [ ] **Step 2: Convert entry to a component** — the current `main.tsx` does `createRoot(...).render(<App/>)`. Create `apps/web/src/demos/livehouse/LivehouseApp.tsx` exporting the existing `<App/>` composition as the default export (move the JSX from `App.tsx`/`main.tsx`; drop the `createRoot` bootstrap — Astro's island runtime mounts it). Config loading that `main.tsx` did before render moves into a `useEffect`/top-level `await` in `LivehouseApp` or a wrapping loader component.

- [ ] **Step 3: Fix asset paths** — any `import.meta.env.BASE_URL`/relative asset URL that assumed the old app root must resolve under `/` (assets now in `apps/web/public`). Grep the demo for `public`/asset URLs and repoint to `/…`.

- [ ] **Step 4: Route** `apps/web/src/pages/showroom/livehouse.astro`

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import LivehouseApp from '../../demos/livehouse/LivehouseApp.tsx';
---
<BaseLayout title="Livehouse PA Simulator">
  <LivehouseApp client:only="react" />
</BaseLayout>
```

- [ ] **Step 5: Move demo tests** — `git mv apps/showroom/tests apps/web/tests/livehouse` (and `apps/showroom/vitest.config.ts` merged into a new `apps/web/vitest.config.ts` using `@vitest/browser` Playwright, `browser.enabled`, `browser.provider: 'playwright'`). Update import paths in the moved tests to the new demo location.

- [ ] **Step 6: Verify build + run demo tests + commit**

Run `pnpm --filter @audiorective/web build` (expect `dist/showroom/livehouse/index.html`), then `pnpm --filter @audiorective/web test -- --run`. Expected: build passes, ported tests pass. `git add -A && git commit -m "feat(web): port livehouse simulator as island route"`.

---

### Task 1.7: Remove old apps + update references

**Files:**

- Delete: `apps/showroom/`, `apps/pixi-visualizer/`
- Modify: `README.md` (Examples section + links), root `package.json` scripts if they name the old apps (they use `-r`, so likely no change)

- [ ] **Step 1: Delete old app folders**

```bash
git rm -r apps/showroom apps/pixi-visualizer
```

- [ ] **Step 2: Update README** — in the "Examples" section, repoint the two demo descriptions to the site routes and new source paths (`apps/web/src/demos/livehouse`, `apps/web/src/demos/pixi`); keep the prose. Update any `apps/showroom`/`apps/pixi-visualizer` links elsewhere in `README.md`.

- [ ] **Step 3: Verify workspace + build + commit**

Run `pnpm install` then `pnpm -r build`. Expected: whole monorepo builds; no dangling references to removed apps. `git add -A && git commit -m "chore: remove standalone demo apps, update README"`.

---

# Phase 2 — Landing copy sections (static) + Motion reveals

Deliverable: the full copy-deck content spine renders statically at `/`, styled, with scroll reveals. No audio yet.

### Task 2.1: Landing section components (static copy)

**Files:**

- Create: `apps/web/src/components/landing/Hero.astro`, `Thesis.astro`, `PainPoints.astro`, `Composability.astro`, `AgentSkill.astro`, `SendOff.astro`; `apps/web/src/styles/landing.css`
- Modify: `apps/web/src/pages/index.astro` (compose sections)

**Interfaces:**

- Produces: six section components, each self-contained, copy verbatim from `apps/web/copy/landing-page.md`.

- [ ] **Step 1: Hero** `Hero.astro` — H1 "Delightful Web Audio primitives that you — and your LLM — actually love to use.", sub-line "State · Clock · Analysis · Bindings", the paragraph (deck §1), CTAs `Get Started →` → `/docs/get-started`, `View Showroom` → `/showroom`. Copy strings verbatim from deck §1.

- [ ] **Step 2: Thesis** `Thesis.astro` — the "problem & the goal" section carrying the guiding spine (deck §2 guiding-spine blockquote as the anchor line). Verbatim.

- [ ] **Step 3: PainPoints shell** `PainPoints.astro` — section header "A few of the most significant pain points"; renders two card slots (State, Clock) and the Tone.js bridge prose (deck §3 card collapsed copy + §3 Tone.js bridge). In Phase 2 the cards are static (title + one-liner + expanded reasoning visible or in a native `<details>`); the live diagrams + accordion behavior arrive in Phase 3. Copy verbatim.

- [ ] **Step 4: Composability** `Composability.astro` — header "Take what you need. Come back for more whenever." + the baseplate body paragraph (deck §4). Leaves a placeholder `<div class="lego-mount">` for the Phase 3 animation. Verbatim.

- [ ] **Step 5: AgentSkill** `AgentSkill.astro` — header "Sustainable Vibe Coding" + body + `Install the skill →` → `/docs/get-started` (deck §5). Verbatim.

- [ ] **Step 6: SendOff** `SendOff.astro` — header "Go make some noise." + sub-line + three CTAs `Showroom` `/showroom`, `Docs` `/docs/overview`, `GitHub ★` (repo). **No footer element after it.** (deck §6). Verbatim.

- [ ] **Step 7: Compose + style** `index.astro` renders the six in order inside `BaseLayout`. Apply `frontend-design` for the dark cyber-livehouse aesthetic in `landing.css`.

- [ ] **Step 8: Verify + commit**

Run `pnpm --filter @audiorective/web build`. Then verify visually: use the Claude Preview MCP (`preview_start`, `preview_screenshot`) against the built/preview server to confirm all six sections render top-to-bottom with correct copy and no footer. `git add apps/web && git commit -m "feat(web): landing content spine (static)"`.

---

### Task 2.2: Motion scroll reveals

**Files:**

- Create: `apps/web/src/components/landing/Reveal.tsx`
- Modify: section components to wrap their content in `<Reveal>` where a reveal is wanted

**Interfaces:**

- Produces: `Reveal` React component — fades/translates children in on scroll into view using `motion`.

- [ ] **Step 1: Reveal island**

```tsx
import { motion } from "motion/react";
import type { ReactNode } from "react";
export default function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Apply** — in each section `.astro`, wrap the main block: `<Reveal client:visible>…</Reveal>`. Keep the hero un-revealed (above the fold).

- [ ] **Step 3: Verify + commit** — build; preview-screenshot mid-scroll to confirm reveals fire. `git commit -am "feat(web): scroll reveals via motion"`.

---

# Phase 3 — Live pain diagrams + Lego animation

Deliverable: the two pain cards animate as truthful live simulations inside a one-open accordion; the composability section runs the looping Lego canvas.

### Task 3.1: State desync diagram

**Files:**

- Create: `apps/web/src/components/diagrams/StateDiagram.tsx`
- Test: `apps/web/tests/diagrams/state-diagram.test.tsx`

**Interfaces:**

- Produces: `StateDiagram` default React component (SVG). Self-contained rAF simulation of the desync model (deck §3 Card 1 diagram): two boxes (UI Framework / Audio Engine) showing the same value; a periodic driver "moves a slider" so the UI value jumps, the Audio value lags (tinted stale), a sync pulse crosses, and they reconcile — looping so the gap is the visible story.
- Exposes `export function computeDesync(t: number): { ui: number; audio: number; syncing: boolean }` (pure, unit-tested) driving the render.

- [ ] **Step 1: Failing test for the model**

```tsx
import { computeDesync } from "../../src/components/diagrams/StateDiagram";
import { expect, test } from "vitest";
test("audio value lags ui value during the desync window", () => {
  const early = computeDesync(0.1); // just after a slider move
  expect(early.ui).not.toBeCloseTo(early.audio, 2);
  const late = computeDesync(0.95); // after sync pulse completes
  expect(late.ui).toBeCloseTo(late.audio, 2);
});
```

- [ ] **Step 2: Run — verify fail** (`pnpm --filter @audiorective/web test -- --run state-diagram`; FAIL: `computeDesync` not exported).

- [ ] **Step 3: Implement `computeDesync` + SVG render** — pure `computeDesync(t)` where `t` is loop phase 0..1: `ui` steps to a new target at phase 0, `audio` follows only after the sync window (e.g. lags until t>0.6, then ramps to `ui`), `syncing` true during the pulse. Render two `<rect>` boxes with the numeric values, tint the audio box red while `ui !== audio`, animate a pulse `<circle>` along a connector during `syncing`. Drive `t` via `requestAnimationFrame` in a `useEffect` (respect `prefers-reduced-motion`: hold a static desynced frame).

- [ ] **Step 4: Run — verify pass.**

- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(web): live State desync diagram"`.

---

### Task 3.2: Clock scheduling diagram

**Files:**

- Create: `apps/web/src/components/diagrams/ClockDiagram.tsx`, `apps/web/src/components/diagrams/lookaheadModel.ts`
- Test: `apps/web/tests/diagrams/lookahead-model.test.ts`

**Interfaces:**

- Produces: `lookaheadModel.ts` exporting `export interface Beat { grid: number; jsActual: number; audioActual: number; late: boolean }` and `export function simulateBeats(opts: { count: number; jitter: number; gcAt: number }): Beat[]` (pure) — models the two-clocks story: audio beats land on `grid`; JS `setTimeout` beats jitter and one slips late at `gcAt`; the lookahead places notes back on the grid. `ClockDiagram` default React component renders two stacked timelines from the model and animates a playhead; in Phase 4 the audio row's data source is swapped to the live transport (Task 4.6).

- [ ] **Step 1: Failing test**

```ts
import { simulateBeats } from "../../src/components/diagrams/lookaheadModel";
import { expect, test } from "vitest";
test("a GC hit makes exactly one JS beat late while audio stays on grid", () => {
  const beats = simulateBeats({ count: 8, jitter: 0.02, gcAt: 3 });
  expect(beats[3].late).toBe(true);
  expect(beats[3].audioActual).toBeCloseTo(beats[3].grid, 5); // audio never late
  expect(beats.filter((b) => b.late).length).toBe(1);
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement `simulateBeats` + SVG timelines** — audio row: `audioActual = grid` always. JS row: `jsActual = grid + deterministicJitter(i, jitter)`, and at `i === gcAt` add a large delay so `late = true`. Render top (audio, locked to grid) and bottom (JS, jittering; red GC block at `gcAt`), plus a resolution caption showing lookahead placing notes on the grid. rAF playhead; honor `prefers-reduced-motion`.

- [ ] **Step 4: Run — verify pass. Step 5: Commit** `git commit -am "feat(web): live Clock scheduling diagram"`.

---

### Task 3.3: Accordion wiring for pain cards

**Files:**

- Create: `apps/web/src/components/landing/PainCard.tsx`, `apps/web/src/components/landing/PainAccordion.tsx`
- Modify: `apps/web/src/components/landing/PainPoints.astro`
- Test: `apps/web/tests/landing/pain-accordion.test.tsx`

**Interfaces:**

- Produces: `PainAccordion` (one-open-at-a-time) containing two `PainCard`s. `PainCard` props `{ id: string; title: string; oneLiner: string; open: boolean; onToggle: (id) => void; diagram: ReactNode; children: ReactNode }` — collapsed shows title + one-liner + diagram (always visible); expanded reveals `children` (reasoning). Cards receive `<StateDiagram/>` / `<ClockDiagram/>` as `diagram`.

- [ ] **Step 1: Failing test** (browser) — render `PainAccordion`; assert only one card's reasoning is visible; clicking the second collapses the first.

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import PainAccordion from "../../src/components/landing/PainAccordion";

test("opening the second card closes the first", async () => {
  render(<PainAccordion />);
  await userEvent.click(screen.getByRole("button", { name: /according to my state/i }));
  expect(screen.getByText(/State ends up owned twice/i)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: /two clocks/i }));
  expect(screen.queryByText(/State ends up owned twice/i)).not.toBeVisible();
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** `PainCard` + `PainAccordion` (accordion state `openId`, `useState`; collapsed diagram always rendered; expanded reasoning gated by `open`; use accessible `<button>` with `aria-expanded`). Copy the collapsed titles/one-liners and expanded reasoning verbatim from deck §3 Cards 1 & 2.

- [ ] **Step 4: Mount in `PainPoints.astro`** — replace the Phase-2 static cards with `<PainAccordion client:visible />`; keep the section header and the Tone.js bridge prose (static, after the accordion).

- [ ] **Step 5: Run — verify pass. Step 6: Commit** `git commit -am "feat(web): pain-point accordion with live diagrams"`.

---

### Task 3.4: Lego composability animation

**Files:**

- Create: `apps/web/src/components/landing/Lego.tsx`, `apps/web/src/components/landing/legoScene.ts`
- Modify: `apps/web/src/components/landing/Composability.astro` (mount into `.lego-mount`)
- Test: `apps/web/tests/landing/lego-scene.test.ts`

**Interfaces:**

- Produces: `legoScene.ts` with pure helpers — `export function pickPiles(seed: number, count: number): number[]` (distinct pile indices, varies per loop) and `export function assembleShape(pieces: number[]): { x: number; y: number }[]` (target positions faintly echoing a waveform/play-button); `Lego` default React component draws a Canvas 2D faux-2.5D loop: idle piles → a brick drifts to center → bricks from _different_ piles snap together (click-settle) → abstract shape glides off (shipped); next loop uses different piles. Slow, calm; bricks unlabeled; honor `prefers-reduced-motion` (hold a settled frame).

- [ ] **Step 1: Failing test**

```ts
import { pickPiles } from "../../src/components/landing/legoScene";
import { expect, test } from "vitest";
test("successive loops pull from different pile sets", () => {
  const a = pickPiles(1, 3),
    b = pickPiles(2, 3);
  expect(new Set(a).size).toBe(3); // distinct within a loop
  expect(a.join()).not.toBe(b.join()); // variety across loops
});
```

- [ ] **Step 2: Run — verify fail. Step 3: Implement** `pickPiles`/`assembleShape` + canvas render loop (rAF; 2.5D via y-offset + shading; no external deps). **Step 4: verify pass.** **Step 5: Mount** `<Lego client:visible />` in `Composability.astro`. **Step 6: Commit** `git commit -am "feat(web): looping Lego composability canvas"`.

---

# Phase 4 — The instrument layer

Deliverable: the homepage is a live audiorective app — one engine singleton driven by scattered island controls and a sticky transport; the Clock diagram reads the real scheduler. **Depends on `@audiorective/clock`.** Task 4.0 provides an interim shim so the rest of the phase is unblocked.

### Task 4.0: Clock dependency — real package or interim shim

**Files:**

- Create: `apps/web/src/instrument/transport.ts`
- Modify: `apps/web/package.json` (add `@audiorective/clock` when available)

**Interfaces:**

- Produces: `export { Transport } from '@audiorective/clock'` **if** the package is published with the assumed contract (Global Constraints); **else** a local `Transport` class implementing that exact interface, clearly marked temporary.

- [ ] **Step 1: Decide source** — if `@audiorective/clock` exists on the workspace/npm with `Transport` matching the assumed contract, add it as a dep and re-export it from `transport.ts`; skip to Task 4.1. Otherwise implement the interim shim (Steps 2–4).

- [ ] **Step 2: Failing test** `apps/web/tests/instrument/transport.test.ts` — with a mocked/offline context, `every('16n', cb)` fires `cb` with monotonically increasing `time` values ahead of `ctx.currentTime`, and `stop()` halts callbacks.

- [ ] **Step 3: Implement interim `Transport`** — Chris Wilson lookahead: a `setInterval` (interval ≈ 25 ms) wakes and, while `nextNoteTime < ctx.currentTime + lookahead`, calls each registered `cb(nextNoteTime, step)` and advances `nextNoteTime` by the beat duration derived from `bpm.value`. `bpm` is a `SchedulableParam`; `isPlaying` a `signal`-backed `Readable<boolean>`. Header comment: `// TEMPORARY: replaced by @audiorective/clock when published. Keep this file's public API identical to the assumed Transport contract.`

- [ ] **Step 4: Run — verify pass. Step 5: Commit** `git commit -am "feat(web): transport (interim clock shim)"`.

---

### Task 4.1: Instrument engine singleton

**Files:**

- Create: `apps/web/src/instrument/engine.ts`, `apps/web/src/instrument/PadSynth.ts`, `apps/web/src/instrument/pattern.ts`
- Test: `apps/web/tests/instrument/engine.test.ts`

**Interfaces:**

- Consumes: `createEngine`, `Analyser`, `Sampler`/`AudioProcessor` from core; `Transport` from `./transport`.
- Produces (the shared singleton every island imports):
  ```ts
  export const engine: {
    core: AudioEngine;
    synth: PadSynth; // params: { cutoff: SchedulableParam; reverb: Param<number>; volume: SchedulableParam }
    transport: Transport; // bpm, start/stop, isPlaying
    analyser: Analyser; // readFrequencies / readWaveform
    pads: { id: string; trigger: (time?: number) => void }[];
    ensureStarted: () => Promise<void>; // resume AudioContext on a user gesture
  };
  ```
- `PadSynth extends AudioProcessor<{ cutoff: SchedulableParam; reverb: Param<number>; volume: SchedulableParam }>` with a filtered oscillator voice + `playNote(midi: number, time: number)`; `pattern.ts` exports `export const STEPS: number[]` (a 16-step loop) consumed by the transport callback.

- [ ] **Step 1: Failing test** — `engine.synth.params.cutoff.value = 800` reflects in `.value`; `engine.transport.every` callback advances a step counter over `STEPS.length` and wraps. (Use an `OfflineAudioContext` or a stub context so no real audio is needed.)

```ts
import { expect, test } from "vitest";
import { engine } from "../../src/instrument/engine";
test("cutoff param is settable and pattern wraps", () => {
  engine.synth.params.cutoff.value = 800;
  expect(engine.synth.params.cutoff.value).toBe(800);
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** `PadSynth` (osc → biquad lowpass (`cutoff`) → gain (`volume`) → `output`; `reverb` a dry/wet `Param` mixing a `ConvolverNode` or feedback delay; `playNote(midi, time)` schedules an envelope at `time`). `engine.ts`: `export const engine = createEngine((ctx) => { const synth = new PadSynth(ctx); const analyser = new Analyser(ctx, { fftSize: 1024, smoothingTimeConstant: 0.8 }); const transport = new Transport(ctx, { bpm: 110 }); synth.output.connect(analyser.input); analyser.output.connect(ctx.destination); transport.every('16n', (time, step) => { const note = STEPS[step % STEPS.length]; if (note >= 0) synth.playNote(note, time); }); return { synth, transport, analyser, pads: makePads(ctx, synth), ensureStarted: () => engine.core.resume() }; })`. `ensureStarted` calls `engine.core.resume()`.

- [ ] **Step 4: Run — verify pass. Step 5: Commit** `git commit -am "feat(web): instrument engine singleton + looping pattern"`.

---

### Task 4.2: Enable-sound affordance

**Files:**

- Create: `apps/web/src/components/instrument/EnableSound.tsx`
- Modify: `apps/web/src/pages/index.astro` (mount near top)

**Interfaces:**

- Consumes: `engine` singleton, `useValue`.
- Produces: `EnableSound` — a fixed, tasteful control; on click calls `engine.ensureStarted()` then `engine.transport.start()`; label reflects `useValue(engine.transport.isPlaying)` and `useValue(engine.core.state)`.

- [ ] **Step 1: Implement** the button (fixed position, does not overlap hero CTAs). Click handler: `await engine.ensureStarted(); engine.transport.start();`. Show "▶ turn on the sound" when not playing, "⏸ sound on" when playing (toggles `transport.stop()/start()`).
- [ ] **Step 2: Mount** `<EnableSound client:only="react" />` in `index.astro`. **Step 3:** build + preview-screenshot to confirm it renders and toggles. **Step 4: Commit** `git commit -am "feat(web): enable-sound affordance"`.

---

### Task 4.3: Floating control islands (knobs + pads)

**Files:**

- Create: `apps/web/src/components/instrument/Knob.tsx`, `apps/web/src/components/instrument/FloatingControls.tsx`, `apps/web/src/components/instrument/Pads.tsx`
- Modify: `apps/web/src/pages/index.astro`
- Test: `apps/web/tests/instrument/knob.test.tsx`

**Interfaces:**

- Consumes: `engine`, `useValue`.
- Produces: `Knob` props `{ param: SchedulableParam | Param<number>; label: string; min: number; max: number }` — pointer-drag writes `param.value`, displays `useValue(param)`; `FloatingControls` positions knobs (cutoff, bpm→`engine.transport.bpm`, reverb, volume) fixed at the page edges; `Pads` renders trigger buttons from `engine.pads`.

- [ ] **Step 1: Failing test** — render a `Knob` bound to `engine.synth.params.cutoff`; simulate a drag; assert `engine.synth.params.cutoff.value` changed and the displayed value updated (proves `useValue` round-trips).
- [ ] **Step 2: Run — verify fail.**
- [ ] **Step 3: Implement** `Knob` (pointer events → map dy to `param.value` within `[min,max]`; render `useValue(param)`), `FloatingControls` (`position: fixed`, edge-anchored, `z-index` above content but below nav; pointer-events only on the controls), `Pads` (`onPointerDown={() => pad.trigger()}`).
- [ ] **Step 4: Run — verify pass. Step 5: Mount** both as separate islands (`client:only="react"`) in `index.astro` — deliberately separate roots. **Step 6: Commit** `git commit -am "feat(web): floating instrument controls"`.

---

### Task 4.4: Sticky transport with visualizers

**Files:**

- Create: `apps/web/src/components/instrument/StickyTransport.tsx`, `apps/web/src/components/instrument/Spectrum.tsx`, `apps/web/src/components/instrument/Waveform.tsx`
- Modify: `apps/web/src/pages/index.astro`, `apps/web/src/components/landing/Hero.astro` (add a `#hero-sentinel` element for IntersectionObserver)
- Test: `apps/web/tests/instrument/sticky-transport.test.tsx`

**Interfaces:**

- Consumes: `engine`, `useValue`.
- Produces: `Spectrum`/`Waveform` — canvas components that `engine.analyser.readFrequencies`/`readWaveform` per rAF; `StickyTransport` — fixed top bar, hidden until `#hero-sentinel` leaves the viewport (IntersectionObserver), with play/pause (`engine.transport`) + `<Spectrum/>` + `<Waveform/>`.

- [ ] **Step 1: Failing test** (browser) — render `StickyTransport` with a stub IntersectionObserver; when the sentinel is reported off-screen, the bar becomes visible; play button toggles `engine.transport.isPlaying`.
- [ ] **Step 2: Run — verify fail.**
- [ ] **Step 3: Implement** `Spectrum` (bars from a `Uint8Array` frequency buffer), `Waveform` (line from the time-domain buffer), `StickyTransport` (IntersectionObserver on `#hero-sentinel`; `visible` state toggles a CSS class; play/pause calls `engine.transport.start()/stop()`, label from `useValue(engine.transport.isPlaying)`).
- [ ] **Step 4: Run — verify pass. Step 5: Mount** `<StickyTransport client:only="react" />` in `index.astro`; add `<div id="hero-sentinel" />` at the bottom of `Hero.astro`. **Step 6:** build + preview-screenshot scrolled past hero to confirm the bar appears and animates. **Step 7: Commit** `git commit -am "feat(web): sticky transport with spectrum + waveform"`.

---

### Task 4.5: Cross-island shared-state proof (regression test)

**Files:**

- Test: `apps/web/tests/instrument/shared-state.test.tsx`

**Interfaces:**

- Consumes: `engine`, `Knob`, `Spectrum`/a readout component.

This test encodes the thesis so it can't silently regress: two **separately rendered** React roots share the one engine.

- [ ] **Step 1: Write the test** — render a `Knob` (bound to `engine.synth.params.cutoff`) into container A and a small readout using `useValue(engine.synth.params.cutoff)` into container B (two independent `render` roots). Drag the knob in A; assert the readout in B updates — with no shared React context between them.

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { engine } from "../../src/instrument/engine";
// … render Knob into rootA, Readout into rootB, drive param, assert rootB reflects it …
test("a param change in one island root is observed in a separate island root", () => {
  engine.synth.params.cutoff.value = 1234;
  // Readout rendered in a separate root shows 1234 via useValue
});
```

- [ ] **Step 2: Run — verify it passes** (it validates already-built code). **Step 3: Commit** `git commit -am "test(web): cross-island shared-engine proof"`.

---

### Task 4.6: Clock diagram reads the live scheduler (synergy)

**Files:**

- Modify: `apps/web/src/components/diagrams/ClockDiagram.tsx`

**Interfaces:**

- Consumes: `engine.transport`, the existing `simulateBeats`/timeline render from Task 3.2.

- [ ] **Step 1: Swap the audio row's data source** — when the instrument is playing (`useValue(engine.transport.isPlaying)`), feed the audio timeline the transport's actual scheduled beat times (subscribe via an effect that records `time`/`step` from a lightweight `engine.transport.every` tap, or a times buffer the engine exposes) instead of the synthetic `grid`. The JS-clock row and GC block stay simulated (that's the _problem_ being illustrated). When not playing, fall back to the Task 3.2 simulation. This is a data-source swap only — the SVG render is unchanged.
- [ ] **Step 2: Verify** — build; preview: with sound on, the audio row locks to the real transport; with sound off, the standalone sim runs. **Step 3: Commit** `git commit -am "feat(web): Clock diagram powered by the live transport"`.

---

## Self-Review

**Spec coverage check** (against `docs/superpowers/specs/2026-06-29-audiorective-website-design.md`):

- Site map (`/`, `/docs`, `/showroom`, `/showroom/livehouse`, `/showroom/pixi`) → Tasks 1.1–1.6. ✅
- Nav = logo·Docs·Showroom·GitHub → Task 1.1 Step 4 + Global Constraints. ✅
- Docs read `docs/` in place → Task 1.2 (glob loader + fallback). ✅
- Get Started / Install page targeting hero + skill CTAs → Task 1.3, wired in 2.1. ✅
- Demos ported to native islands; old apps removed → Tasks 1.5, 1.6, 1.7. ✅
- Landing content spine, verbatim copy, no footer/grid/roadmap → Tasks 2.1–2.2 + Global Constraints. ✅
- Live State + Clock diagrams (truthful sims) → Tasks 3.1, 3.2. ✅
- Accordion one-open → Task 3.3. ✅
- Lego Canvas 2D faux-2.5D → Task 3.4. ✅
- Motion reveals → Task 2.2. ✅
- Instrument: engine singleton, floating controls, sticky transport w/ spectrum+waveform, enable-sound → Tasks 4.1–4.4. ✅
- Cross-island shared-state proof → Task 4.5 (+ Global Constraints rule). ✅
- Clock diagram powered by real scheduler → Task 4.6. ✅
- `@audiorective/clock` as external dependency, phases 1–3 independent → Task 4.0 + phase ordering. ✅
- Testing (engine/scheduler unit, island interaction, ported demo tests, CI build) → Tasks 4.0/4.1 (unit), 3.x/4.3/4.4 (interaction), 1.6 (ported), build steps throughout. ✅
- Aesthetic (dark cyber-livehouse) → Global Constraints + Tasks 2.1/frontend-design. ✅

**Type consistency:** `engine` shape (`synth.params.{cutoff,reverb,volume}`, `transport.{bpm,isPlaying,start,stop,every}`, `analyser.readFrequencies/readWaveform`, `pads[].trigger`) is defined once in Task 4.1 and consumed identically in 4.2–4.6. `useValue`/`createEngineContext`/`createEngine`/`Analyser` names match the verified API reference. Assumed `Transport` contract is identical in Global Constraints, Task 4.0, and Task 4.1.

**Placeholder scan:** visual/styling tasks (2.1, 3.4, 4.x mounts) intentionally verify via the Claude Preview MCP + `frontend-design` rather than asserting pixel output — this is design-iteration work, not un-specified logic; all _logic_ units (docs loader, diagram models, scheduler, engine, accordion, knob, cross-island) carry concrete code and tests. Copy is not duplicated into the plan by design — it is sourced verbatim from `apps/web/copy/landing-page.md` per Global Constraints.

## Notes / risks

- **Docs glob base:** if Astro rejects a `base` outside the project root at build (Task 1.2 Step 4), use the documented symlink fallback — same schema, same outcome.
- **Clock timing:** phase 4 ships against the interim `Transport` shim (Task 4.0) if `@audiorective/clock` isn't published yet; because every consumer targets the assumed contract, swapping to the real package is a dependency change + delete-the-shim, not a rewrite.
- **Ported demo asset paths (Task 1.6 Step 3):** the most likely breakage point — audit asset URLs after the move and before claiming the route works.
