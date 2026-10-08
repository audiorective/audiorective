---
title: Devtools
---

`@audiorective/devtools` measures processor latency and checks it against the processor's declaration. Use it in browser-based tests when writing effects or wrapping AudioWorklets.

```sh
npm install -D @audiorective/devtools
```

## Measure latency

`measureLatency(build, options)` creates an offline context, sends an impulse through the processor, and measures its first arrival and peak. The factory receives a `BaseAudioContext` and returns an `AudioProcessor` with both input and output.

```ts
import { measureLatency } from "@audiorective/devtools";
import { Filter } from "@audiorective/effects";

const report = await measureLatency((context) => new Filter(context, { frequency: 8000 }));
console.log(report.declared, report.runs);
```

The default sample rates are 44.1 kHz and 48 kHz. Options include `sampleRates`, `channels`, `windowSeconds`, and the detection `threshold`. For a processor that initializes asynchronously, pass `ready: (processor) => processor.ready` with the appropriate processor type.

## Assert a declaration

`assertLatency(build, options)` checks measured arrival against the declared latency and throws on a mismatch. Use a processor configuration that produces an audible response to an impulse; a fully dry effect does not measure its wet processing path.

See the [latency guide in Core](/docs/core) for declarations and automatic graph compensation. Measurements require Web Audio support, such as Vitest browser mode; a Node-only test environment has no `OfflineAudioContext`.
