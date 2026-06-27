# pixi-visualizer

A complete PixiJS + audiorective app, built with **only** `@audiorective/core`,
`alien-signals`, and `pixi.js` — **no binding package**. It's the worked example
for [`docs/pixijs.md`](../../docs/pixijs.md).

A `DroneSynth` (osc → lowpass → gain, pure core) feeds a core `Analyser`. The Pixi
layer:

- **boots** the engine with `engine.core.autoStart(app.canvas)` (the only glue);
- **visualizes** the spectrum by polling `analyser.readFrequencies(...)` in
  `app.ticker` (per-frame, non-reactive data);
- **reacts** to `volume` with an `alien-signals` `effect()` that scales a glow
  (signal-driven data);
- **controls** the synth by writing `param.value` from pointer drags
  (x → cutoff, y → volume).

```sh
pnpm --filter @audiorective/pixi-visualizer dev
```

Click to start the drone, then drag the puck.
