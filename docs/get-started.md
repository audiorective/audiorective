---
title: Get Started
---

## Play your first sound

Install core in a browser application:

```sh
npm install @audiorective/core
```

Add a button to your page:

```html
<button id="play">Play tone</button>
```

Run this TypeScript in the browser, after the button mounts. It generates a short tone, so you do not need an audio file.

```typescript
import { createEngine, Sampler } from "@audiorective/core";

const engine = createEngine((context) => {
  const buffer = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / context.sampleRate);
  }
  return { tone: new Sampler(context, { buffer, volume: 0.15, fadeIn: 0.01, fadeOut: 0.05 }) };
});

engine.core.defineGraph(() => [[engine.tone, engine.core.context.destination]]);

document.querySelector<HTMLButtonElement>("#play")!.onclick = async () => {
  await engine.core.start();
  engine.tone.trigger();
};
```

The click starts the audio context. `Sampler` plays the buffer and applies short fades at its edges. Change `engine.tone.params.volume.value` to adjust its level. When your application unmounts, call `engine.core.destroy()` to release the engine and its processors.

For Astro, Next.js, or another server-rendered framework, use a [client-only boundary](/docs/client-boundary).

## Add what your app needs

- [Clock](/docs/clock) adds transport, musical time, and look-ahead scheduling.
- [Effects](/docs/effects) adds filters, delay, reverb, dynamics, and other processors.
- [React](/docs/react) connects components to the engine's reactive state.
- [Core](/docs/core) covers custom processors, routing, automation, and offline rendering.

See [Installation](/docs/installation) for all packages, or explore the [working examples](/showroom).

## Use the agent skills

The skills give your coding assistant API guidance and application patterns.

```sh
npx skills add audiorective/audiorective
```

For the Claude Code plugin:

```sh
/plugin marketplace add audiorective/audiorective
/plugin install audiorective@audiorective
```
