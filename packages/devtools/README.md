# @audiorective/devtools

Dev-time validators for [`@audiorective/core`](../core) processors — impulse-based latency
measurement.

This is a dev dependency: install it in `devDependencies`, never import it from application
code. It depends only on `@audiorective/core`.

## `assertLatency`

`assertLatency` sends a single-sample impulse into a processor's `input`, renders it offline
at each configured sample rate, and checks where the impulse arrives at `output` against the
processor's declared `latency`. Use it as a pin test: write it once against the processor's
current declaration, run it, and if it fails, paste the declaration the failure message
suggests.

```ts
import { assertLatency } from "@audiorective/devtools";
import { MyEffect } from "../src/MyEffect";

it("declares its latency correctly", async () => {
  await assertLatency((ctx) => new MyEffect(ctx));
});
```

A wrong declaration throws with a message like:

```
MyEffect latency mismatch
  declared   0
  measured   441 @44100 · 480 @48000   (first arrival; peak 452 · 491)

  Measured latency scales with sample rate — declare it as time:
    latency: Math.round(0.01 * ctx.sampleRate)
```

or, for a fixed sample count:

```
  Constant across sample rates — declare it in samples:
    latency: 512
```

or, when the measured runs fit neither model (including when they simply disagree with each
other beyond `tolerance`):

```
  Latency fits neither a samples nor a time model; measure by hand.
```

Paste whichever `latency: ...` line the failure suggests into the processor's build callback,
then rerun the test.

### Options

```ts
interface MeasureOptions {
  sampleRates?: number[]; // default [44100, 48000]
  channels?: number; // default 2
  windowSeconds?: number; // default 1
  threshold?: number; // default 1e-4
}

assertLatency(build, { ...MeasureOptions, tolerance?: number /* default 1 */ });
```

The processor must be audible in its default state (wet, gated open, etc.) — set that up
inside the `build` factory before returning the processor.

## `measureLatency`

The lower-level primitive `assertLatency` is built on. Returns a report instead of throwing:

```ts
const report = await measureLatency((ctx) => new MyEffect(ctx));
// { declared: 0, runs: [{ sampleRate: 44100, firstArrival: 441, peak: 452 }, ...] }
```

## Vitest browser-mode config

Both functions render real `OfflineAudioContext`s, so tests using them need a browser
environment, not jsdom. This package's own tests run under headless Chromium via
`@vitest/browser-playwright`:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    // Audio tests assert against the AudioContext wall-clock; running test files in
    // parallel browser contexts starves those timers and makes them flaky. Serialize.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
```
