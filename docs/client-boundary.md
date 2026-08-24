---
title: Server-rendered frameworks
---

audiorective is client-only. `createEngine` builds a real `AudioContext`, so an engine module evaluated on a server throws `EngineEnvironmentError`.

In Next.js, Remix, or Astro, mount the audio subtree behind a client-only boundary and use the plain API inside it. There is nothing SSR-specific to configure.

## `'use client'` is not a boundary

It marks a module as part of the client bundle. It does **not** stop the server from evaluating it — React still renders client components on the server to produce initial HTML, so `createEngine` runs in Node and throws.

You need a boundary that skips the server render entirely.

## The pattern

**Next.js** (pages router and app router):

```tsx
import dynamic from "next/dynamic";

const AudioWorkspace = dynamic(() => import("./AudioWorkspace"), {
  ssr: false,
  loading: () => <WorkspaceSkeleton />,
});

export default function Page() {
  return <AudioWorkspace />;
}
```

In the app router, `next/dynamic` with `ssr: false` must be called from a client component; the page around it can stay a server component.

**Astro** — use `client:only`, not `client:load`:

```astro
<AudioWorkspace client:only="react" />
```

**Inside the island**, module-scope `createEngine` is correct and canonical — the island guarantees the module only ever loads in a browser:

```ts
// audio/engine.ts — only ever imported from inside the island
export const engine = createEngine((ctx) => ({
  synth: new Synth(ctx),
}));

export const { EngineProvider, useEngine } = createEngineContext(engine);
```

## Choosing the seam

**Inside**: the engine module, and anything that imports it _transitively_. That last word is where this usually goes wrong — one engine-dependent hook re-exported from an otherwise-safe module pulls the whole audio graph into every page that imports it.

**Outside**: SEO text, navigation, layout, and reactive state with no Web Audio dependency. A plain `Cell` is just a signal, so a document model built on `Cell` is safe to read anywhere and usually belongs outside, keeping the static parts of the page prerendered.

Three rules that decide most seams:

- **One provider per island.** If two sibling components both need the engine, put the island above both — two providers means two `autoStart` listeners on the document.
- **Anything you want in the prerendered HTML must live outside the island**, including children passed into it. The island renders nothing on the server.
- **Give `loading` the same footprint as the audio UI**, or the page jumps when the island arrives. Rendering audio values server-side would only ever emit defaults ("stopped", "0:00"), so a static placeholder loses nothing.

## For non-browser environments

Supplying a context bypasses the check entirely — this is how you run against a mock or a host-provided context:

```ts
createEngine(setup, { context });
```

## Troubleshooting

**`EngineEnvironmentError` during a build or server render.** An audio module leaked across the boundary. Find the import path into the engine module, then either move the importer inside the island or split the offending export out of it. Start from the bundler's import trail — webpack prints "Import trace for requested module" — since the error's stack names a built chunk rather than your source.

**`EngineEnvironmentError` in a jsdom test.** Different cause: the environment has a `window` but no Web Audio. Pass a mock context, or run the test in a real browser.

**UI silently stops updating**, with no error and values that never change. Check for two copies of `alien-signals`: an `effect()` from one copy cannot track a signal created by the other. This appears with linked or vendored packages, or a lockfile that failed to dedupe. Deduplicate, or alias the package in your bundler config — and alias the _entry file_, not the directory, since it is exports-only.
