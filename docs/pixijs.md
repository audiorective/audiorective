# Pairing PixiJS with audiorective

**There is no `@audiorective/pixijs` package — and you don't need one.** Core
(`@audiorective/core`) plus `alien-signals` already gives a PixiJS app everything
it needs. This page is the good-practice guide for wiring the two together.

## Why no binding package

The other renderer bindings exist to bridge a real gap:

- `@audiorective/react` ships `useValue` because React's render is **pull-based**
  and fights signals — you need an adapter to turn a signal change into a
  re-render.
- `@audiorective/threejs` / `@audiorective/playcanvas` ship `attach` because those
  engines own an audio context (three.js's global `AudioContext`, PlayCanvas's
  `SoundManager`) that must be **reconciled** with the engine's.

PixiJS triggers neither:

- It's an **imperative, retained-mode** renderer. You mutate `sprite.x` directly
  inside an `alien-signals` `effect()` and read values inside `app.ticker`. No
  pull/push adapter is needed — this is exactly the imperative-view pattern in
  [architecture.md](./architecture.md) ("read with `effect(() => engine.x.$())`,
  write with `.value =`").
- Core PixiJS has **no audio subsystem** (sound is the separate `@pixi/sound`
  plugin), so there's no context to reconcile. Booting audio is a one-liner that
  already lives in core.

So the whole integration is conventions, not code. The rest of this page is those
conventions.

## The one rule still applies

Audio logic lives on `AudioProcessor` subclasses; the Pixi layer only **reads**
params/analyser data and **writes** `param.value`. It never schedules audio or
builds the node graph. See [architecture.md](./architecture.md).

## Boot: the only lifecycle glue

`autoStart` is already part of core. Arm it on the Pixi canvas — it installs a
one-shot gesture listener and resumes the `AudioContext` on first interaction,
re-arming if the context is later suspended.

```ts
import { Application } from "pixi.js";
import { engine } from "./audio/engine"; // createEngine(...) — pure audio

const app = new Application();
await app.init({ background: "#0a0a12", resizeTo: window });
document.body.appendChild(app.canvas);

const detachAutoStart = engine.core.autoStart(app.canvas); // ← that's it
```

(PixiJS v8 exposes the element as `app.canvas`; on v7 it's `app.view`.)

## The decision that matters: `effect` vs `ticker`

Audio → visual has **two** channels, and picking the wrong one is the common
mistake:

| Source of the visual data                                                                      | Where to read it           |
| ---------------------------------------------------------------------------------------------- | -------------------------- |
| Reactive state — `Param`, `SchedulableParam`, `Cell`, `computed`                               | `alien-signals` `effect()` |
| Per-frame data with no signal — analyser spectrum/waveform, `SchedulableParam.read()` mid-ramp | `app.ticker.add(...)`      |

Analyser bytes change every audio frame with **no signal to subscribe to** —
putting that poll in an `effect()` would never re-fire. Conversely, driving a
sprite from a `Param` via the ticker works but wastes frames; an `effect` updates
only on actual change.

### Audio → visual, reactive (use `effect`)

```ts
import { effect } from "alien-signals";

// glow scales with level — level is a Param, so this is signal-driven
const stop = effect(() => {
  const v = engine.synth.params.level.$(); // raw signal read = tracked
  glow.scale.set(0.6 + v * 0.9);
});
// keep `stop` and call it on teardown
```

### Audio → visual, per-frame (use `ticker` + `Analyser`)

`Analyser` is a core primitive — a pass-through tap exposing the live spectrum and
waveform. Wire it into the engine graph, then poll it from the ticker.

```ts
// audio/engine.ts
import { createEngine, Analyser } from "@audiorective/core";
export const engine = createEngine((ctx) => {
  const synth = new DroneSynth(ctx);
  const analyser = new Analyser(ctx, { fftSize: 256 });
  synth.output.connect(analyser.input);
  analyser.output.connect(ctx.destination);
  return { synth, analyser };
});
```

```ts
// main.ts — poll each frame
const spectrum = engine.analyser.createFrequencyBuffer(); // Uint8Array, reused
app.ticker.add(() => {
  engine.analyser.readFrequencies(spectrum); // 0–255 per bin
  bars.clear();
  for (let i = 0; i < engine.analyser.binCount; i++) {
    const mag = spectrum[i] / 255;
    bars.rect(i * barW, h - mag * h, barW - 2, mag * h).fill({ h: 200 + mag * 120, s: 80, l: 50 });
  }
});
```

## Visual → audio: plain pointer handlers

No adapter. A Pixi interaction handler writes `param.value` — direct mutation, the
same `.value` contract as everywhere else.

```ts
puck.eventMode = "static";
app.stage.on("pointermove", (e) => {
  if (!dragging) return;
  const nx = Math.min(1, Math.max(0, e.global.x / app.screen.width));
  engine.synth.params.cutoff.value = 80 + nx * 7920; // screen x → cutoff
});
```

## Gotcha: don't drive one param from both a ramp and the UI

`SchedulableParam` runs a `requestAnimationFrame` poll (`ParamSync`) that reads the
underlying `AudioParam` back into the signal so the UI stays live during
automation. If you **both** schedule a ramp (`synth.setActive()` →
`linearRampToValueAtTime`) **and** write that same param continuously from a Pixi
drag, the rAF poll will overwrite your UI write mid-ramp — the value visibly
fights. Pick one owner per param, or drive a ramp and a UI control on **different**
params. The worked example does exactly that: a `gate` param the envelope ramps,
and a separate `level` param the puck drag writes — audible gain is `level * gate`,
and neither owner fights the other.

## Lifecycle

Nothing audio-related is owned by Pixi, so teardown is symmetric and simple:

```ts
stopGlowEffect(); // stop any alien-signals effects you created
detachAutoStart(); // disarm the gesture listener
app.destroy(true); // tears down the ticker + stage (removes your ticker callbacks)
engine.core.destroy(); // closes the AudioContext, destroys processors (incl. Analyser)
```

`app.destroy()` removes `app.ticker` callbacks for you; you only need to stop the
`effect()`s you opened and the `autoStart` listener.

## Worked example

[`apps/pixi-visualizer`](../apps/pixi-visualizer) is a complete, runnable app: a
`DroneSynth` (core) visualized as a spectrum via the core `Analyser`, with a
draggable puck (x → cutoff, y → level) and a signal-driven glow. It splits the
UI-owned `level` from the envelope-owned `gate` to honor the Gotcha above, and
uses only `@audiorective/core`, `alien-signals`, and `pixi.js` — no binding package.
