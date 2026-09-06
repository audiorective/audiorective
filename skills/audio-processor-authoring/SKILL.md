---
name: audio-processor-authoring
description: >
  Use when writing, extending, or reviewing an `AudioProcessor` subclass — a
  synth, effect, sampler, analyser, or any class that owns Web Audio nodes:
  params and cells, `bind` rules, `input`/`output`, graph wiring with
  `defineGraph`, latency declaration, `destroy`, and headless tests.
---

# Audio Processor Authoring

How to write an `AudioProcessor` subclass correctly, end to end — skeleton,
state, graph wiring, latency, lifecycle, and tests.

Read `references/authoring-processors.md` for the full walkthrough (each
section paired with a wrong/right example). For the underlying API reference
— every type, option, and built-in processor — see `references/core.md` if
the `audiorective` skill is installed, or `docs/core.md` in this repo.

## Checklist

- **Skeleton** — nodes built as locals before `super()`; build callback
  returns `{ params, cells?, latency? }`; `output` always present, `input`
  added only for effects; `this` assignments happen after `super()`.
- **State** — each value is a `param`, `schedulableParam`, or `cell` for the
  right reason; a data-only class doesn't extend `AudioProcessor`.
- **Graph** — wiring goes through `this.defineGraph`; conditional edges
  express bypass; `AudioParam`/`SchedulableParam` sinks used for modulation
  targets; raw `.connect()` only for a leaf that never joins another path.
- **Latency** — `latency: 0` for musical delay; a real processing delay
  declared in samples or derived from `ctx.sampleRate`; a worklet-backed
  processor declares its latency explicitly.
- **Lifecycle** — an overridden `destroy()` calls `super.destroy()` and
  stops/cleans up anything the base class doesn't own (started sources,
  worklet ports).
- **Testing** — headless vitest browser-mode tests; an `assertLatency` pin
  test for every processor with `input`.
