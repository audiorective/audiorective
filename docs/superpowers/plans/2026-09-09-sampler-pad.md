# Sampler as a Sample Pad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Sampler` (with `polyphony: 1`) a drop-in `Tone.Player` replacement for sample pads by adding fades, reverse, mute, and a blip-free completion signal — closing issue #31 without a new class.

**Architecture:** `Voice` gains `fadeIn`/`fadeOut` and, on a faded stop, releases its source and gain to ring out while finishing immediately for callers. `Sampler` passes fade defaults through, steals without dropping `activeVoices` to 0, keeps a cached reversed buffer with region remapping, and adds a mute `GainNode` ahead of the volume gain. `loadAudioBuffer` widens to `BaseAudioContext`.

**Tech Stack:** TypeScript, Web Audio, alien-signals, vitest browser mode (headless Chromium), `renderOffline` for deterministic audio assertions, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-09-sampler-pad-design.md`

## Global Constraints

- Branch: `feat/sampler-pad`, created from `origin/main` after `git fetch` (never from the local `main`).
- No new runtime dependencies in `@audiorective/core`.
- Fade units are seconds; `when` is absolute `AudioContext` time.
- `Sampler.output` stays the volume `GainNode` (existing tests read its `gain.value`).
- Public API changes get a `CHANGELOG.md` entry under `## [Unreleased]`.
- Tests: `pnpm --filter @audiorective/core test -- --run tests/<file>` (browser mode, files run serially). Type-check: `pnpm --filter @audiorective/core typecheck`.
- Comments describe the present and stay short; doc comments state the contract, not the mechanism.
- The pre-commit hook runs oxlint and prettier over the repo and re-stages; commit output is noisy — confirm with `git log -1`.
- Test helpers used below: `makeBuffer(ctx, seconds)` and `delay(ms)` already exist at the top of `tests/voice.test.ts` and `tests/sampler.test.ts`; reuse them. `renderOffline` is exported from `../src`.

---

### Task 0: Branch

- [ ] **Step 1: Create the branch from upstream main**

```bash
git fetch origin
git switch -c feat/sampler-pad origin/main
```

---

### Task 1: `Voice` fades (`fadeIn`, `fadeOut`)

**Files:**

- Modify: `packages/core/src/Voice.ts`
- Test: `packages/core/tests/voice.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `VoiceOptions.fadeIn?: number`, `VoiceOptions.fadeOut?: number`. Behaviour: faded immediate `stop()` finishes the voice synchronously (`isPlaying === false`, `onEnded` and the `onDone` hook fire) while audio rings out for `fadeOut` seconds.

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `packages/core/tests/voice.test.ts`. Add `renderOffline` to the import from `../src`.

```ts
describe("Voice — fades", () => {
  const RATE = 48000;
  function fullBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const b = ctx.createBuffer(1, Math.ceil(RATE * seconds), RATE);
    b.getChannelData(0).fill(1);
    return b;
  }
  const at = (buf: AudioBuffer, seconds: number) => buf.getChannelData(0)[Math.round(seconds * RATE)]!;

  test("fadeIn ramps the gain from 0 to volume over fadeIn seconds", async () => {
    const out = await renderOffline({ seconds: 0.3, channels: 1, sampleRate: RATE }, async (ctx) => {
      new Voice(ctx, fullBuffer(ctx, 0.3), ctx.destination, { fadeIn: 0.1 }, () => {});
    });
    expect(at(out, 0)).toBeCloseTo(0, 2);
    expect(at(out, 0.05)).toBeCloseTo(0.5, 1);
    expect(at(out, 0.15)).toBeCloseTo(1, 2);
  });

  test("fadeIn ramps to a non-unity volume", async () => {
    const out = await renderOffline({ seconds: 0.3, channels: 1, sampleRate: RATE }, async (ctx) => {
      new Voice(ctx, fullBuffer(ctx, 0.3), ctx.destination, { fadeIn: 0.1, volume: 0.5 }, () => {});
    });
    expect(at(out, 0.15)).toBeCloseTo(0.5, 2);
  });

  test("immediate stop() with fadeOut rings out over fadeOut and finishes the voice now", async () => {
    let doneCount = 0;
    let endedCount = 0;
    let playingAfterStop: boolean | null = null;
    const out = await renderOffline({ seconds: 0.3, channels: 1, sampleRate: RATE }, async (ctx) => {
      const v = new Voice(ctx, fullBuffer(ctx, 0.3), ctx.destination, { fadeOut: 0.1 }, () => {
        doneCount++;
      });
      v.onEnded(() => {
        endedCount++;
      });
      v.stop(); // ctx.currentTime is 0 before rendering starts
      playingAfterStop = v.isPlaying;
    });
    expect(playingAfterStop).toBe(false);
    expect(doneCount).toBe(1);
    expect(endedCount).toBe(1);
    expect(at(out, 0.05)).toBeCloseTo(0.5, 1);
    expect(at(out, 0.15)).toBeCloseTo(0, 3);
  });

  test("scheduled stop(when) with fadeOut fades from `when` and stops at when + fadeOut", async () => {
    let doneCount = 0;
    const out = await renderOffline({ seconds: 0.4, channels: 1, sampleRate: RATE }, async (ctx) => {
      const v = new Voice(ctx, fullBuffer(ctx, 0.4), ctx.destination, { fadeOut: 0.1 }, () => {
        doneCount++;
      });
      v.stop(0.2);
    });
    expect(at(out, 0.19)).toBeCloseTo(1, 2);
    expect(at(out, 0.25)).toBeCloseTo(0.5, 1);
    expect(at(out, 0.35)).toBeCloseTo(0, 3);
    expect(doneCount).toBe(1);
  });

  test("fadeOut stop fires onEnded exactly once on a live context", async () => {
    const ctx = new AudioContext();
    await ctx.resume();
    const dest = ctx.createGain();
    let ended = 0;
    const v = new Voice(ctx, makeBuffer(ctx, 1), dest, { fadeOut: 0.05 }, () => {});
    v.onEnded(() => {
      ended++;
    });
    await delay(30);
    v.stop();
    expect(v.isPlaying).toBe(false);
    await delay(200); // past the ring-out; the released source's onended must not re-fire
    expect(ended).toBe(1);
    void ctx.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @audiorective/core test -- --run tests/voice.test.ts`
Expected: the five new tests FAIL (fade options ignored: sample at 0 is 1 for fadeIn; immediate stop yields 0 at 0.05, etc.).

- [ ] **Step 3: Implement fades in `Voice`**

In `packages/core/src/Voice.ts`:

Add to `VoiceOptions`:

```ts
  /** Seconds to ramp from silence to `volume` at each start. Default 0. */
  fadeIn?: number;
  /** Seconds to ramp to silence before a stop cuts the source. Default 0. */
  fadeOut?: number;
```

Replace the class-level doc comment's last paragraph with:

```ts
 * The per-voice GainNode is lazy: at unity volume with no fades the source
 * connects straight to the destination; a gain is created only when there is
 * something to scale or ramp.
 *
 * A faded immediate stop() finishes the voice for callers right away
 * (isPlaying false, onEnded fired) and lets the audio ring out for `fadeOut`.
```

Add fields next to the existing ones:

```ts
  private readonly fadeIn: number;
  private readonly fadeOut: number;
  private _volume: number;
```

Update the constructor body:

```ts
this.fadeIn = opts.fadeIn ?? 0;
this.fadeOut = opts.fadeOut ?? 0;
this._volume = opts.volume ?? 1;
if (this._volume !== 1 || this.fadeIn > 0 || this.fadeOut > 0) {
  this.gain = this.makeGain(this._volume);
}
this.startSource(opts.when ?? ctx.currentTime, this.offset);
```

(remove the old `if (opts.volume != null && opts.volume !== 1)` block.)

In `set volume(v)`, add `this._volume = v;` as the first line after the `if (this.ended) return;` guard.

Replace `stop()`:

```ts
  stop(when?: number): void {
    if (this.ended) return;
    const now = this.ctx.currentTime;
    if (when != null && when > now && this.source) {
      // Scheduled stop: let it play to `when` (plus the fade); the current source's onended finalizes.
      this.stopScheduled = true;
      this.scheduleFadeOut(when);
      try {
        this.source.stop(when + this.fadeOut);
      } catch {
        /* already stopped */
      }
      return;
    }
    if (this.fadeOut > 0 && this.source && !this.paused) {
      this.releaseCurrent(now);
    } else {
      this.teardownCurrent();
    }
    this.finish();
  }
```

In `startSource`, insert before `if (this.playLength != null) src.start(...)`:

```ts
if (this.fadeIn > 0 && this.gain) {
  const g = this.gain.gain;
  g.cancelScheduledValues(when);
  g.setValueAtTime(0, when);
  g.linearRampToValueAtTime(this._volume, when + this.fadeIn);
}
```

Add two private methods after `teardownCurrent`:

```ts
  /** Ramp the gain to silence over `fadeOut`, starting at `at`. */
  private scheduleFadeOut(at: number): void {
    if (this.fadeOut <= 0 || !this.gain) return;
    const g = this.gain.gain;
    const now = this.ctx.currentTime;
    if (this.fadeIn > 0 && at < this.startedAt + this.fadeIn) {
      // The cut lands inside the fade-in: truncate that ramp at `at` and ramp down from there.
      g.cancelAndHoldAtTime(at);
    } else {
      // A ramp needs an event to start from, or it begins immediately instead of at `at`.
      g.cancelScheduledValues(at);
      g.setValueAtTime(at <= now ? g.value : this._volume, at);
    }
    g.linearRampToValueAtTime(0, at + this.fadeOut);
  }

  /**
   * Hand the live source and gain over to the fade: they ring out on their own
   * and free themselves when the source ends, so the voice can finish now.
   */
  private releaseCurrent(at: number): void {
    const src = this.source;
    const gain = this.gain;
    if (!src) return;
    this.scheduleFadeOut(at);
    this.source = null;
    this.gain = null;
    src.onended = () => {
      src.disconnect();
      gain?.disconnect();
    };
    try {
      src.stop(at + this.fadeOut);
    } catch {
      /* already stopped */
    }
  }
```

`finish()` needs no change: with `source` and `gain` already null, `teardownCurrent()` and `this.gain?.disconnect()` are no-ops for the released nodes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @audiorective/core test -- --run tests/voice.test.ts`
Expected: all tests PASS, including the pre-existing ones (no-fade behaviour is unchanged).

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @audiorective/core typecheck
git add packages/core/src/Voice.ts packages/core/tests/voice.test.ts
git commit -m "feat(core): Voice fadeIn/fadeOut with ring-out on faded stop

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe"
git log -1
```

---

### Task 2: `Sampler` fade defaults and a steal that never drops `activeVoices` to 0

**Files:**

- Modify: `packages/core/src/Sampler.ts`
- Test: `packages/core/tests/sampler.test.ts`

**Interfaces:**

- Consumes: `VoiceOptions.fadeIn` / `fadeOut` from Task 1.
- Produces: `SamplerOptions.fadeIn?: number`, `SamplerOptions.fadeOut?: number` (defaults for every voice; `TriggerOptions` overrides per hit). `cells.activeVoices` stays at its old value or higher across a steal; for `polyphony: 1` it is `1` while the latest hit plays and `0` once that hit ends or is stopped.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/sampler.test.ts`. Extend the import to `import { Sampler, renderOffline } from "../src";` and add `import { effect } from "alien-signals";`.

```ts
describe("Sampler — pad behaviour", () => {
  const RATE = 48000;
  function fullBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
    const b = ctx.createBuffer(1, Math.ceil(RATE * seconds), RATE);
    b.getChannelData(0).fill(1);
    return b;
  }
  const at = (buf: AudioBuffer, seconds: number) => buf.getChannelData(0)[Math.round(seconds * RATE)]!;

  test("fadeOut default applies to a stolen voice: it rings out under the new hit", async () => {
    const out = await renderOffline({ seconds: 0.4, channels: 1, sampleRate: RATE }, async (ctx) => {
      const p = new Sampler(ctx, { buffer: fullBuffer(ctx, 0.4), polyphony: 1, fadeOut: 0.1 });
      p.output.connect(ctx.destination);
      p.trigger({ when: 0 });
      // Steal happens when the JS call runs, and rendering has not started, so the
      // victim's fade begins at ctx time 0 while the new hit is scheduled for 0.2.
      p.trigger({ when: 0.2 });
    });
    expect(at(out, 0.05)).toBeCloseTo(0.5, 1); // victim fading
    expect(at(out, 0.15)).toBeCloseTo(0, 3); // victim gone, new hit not yet started
    expect(at(out, 0.3)).toBeCloseTo(1, 2); // new hit
  });

  test("per-trigger fadeIn overrides the sampler default", async () => {
    const out = await renderOffline({ seconds: 0.3, channels: 1, sampleRate: RATE }, async (ctx) => {
      const p = new Sampler(ctx, { buffer: fullBuffer(ctx, 0.3), fadeIn: 0.2 });
      p.output.connect(ctx.destination);
      p.trigger({ fadeIn: 0 });
    });
    expect(at(out, 0.01)).toBeCloseTo(1, 2);
  });

  test("polyphony 1 steal never passes activeVoices through 0", () => {
    const p = new Sampler(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 1, fadeOut: 0.05 });
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(p.cells.activeVoices.value);
    });
    p.trigger();
    p.trigger();
    p.trigger();
    stop();
    expect(seen[0]).toBe(0);
    expect(seen.slice(1)).not.toContain(0);
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("stopAll() with fadeOut evicts immediately", () => {
    const p = new Sampler(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 2, fadeOut: 0.05 });
    p.trigger();
    p.trigger();
    p.stopAll();
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });
});
```

The `ctx` used by the last two tests is the one from the surrounding file's `beforeEach`; put this `describe` inside the existing top-level `describe("Sampler — trigger & polyphony")` block (before its closing `});`) so it inherits `ctx`, or copy the same `beforeEach`/`afterEach` pair into the new block.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @audiorective/core test -- --run tests/sampler.test.ts`
Expected: the four new tests FAIL (`fadeOut`/`fadeIn` unknown options are ignored; the steal test sees a `0` in `seen`).

- [ ] **Step 3: Implement in `Sampler`**

In `packages/core/src/Sampler.ts`:

Add to `SamplerOptions`:

```ts
  /** Default fade-in for new voices, seconds. Default 0. */
  fadeIn?: number;
  /** Default fade-out when a voice is stopped or stolen, seconds. Default 0. */
  fadeOut?: number;
```

Add fields and constructor assignments:

```ts
  private readonly _fadeIn: number;
  private readonly _fadeOut: number;
```

```ts
this._fadeIn = opts.fadeIn ?? 0;
this._fadeOut = opts.fadeOut ?? 0;
```

Replace `trigger()`:

```ts
  /** Fire a new voice. Returns the Voice, or null if no buffer / dropped by steal:"none". */
  trigger(opts: TriggerOptions = {}): Voice | null {
    if (!this.buffer) {
      console.warn("Sampler.trigger: no buffer set");
      return null;
    }
    let victim: Voice | null = null;
    if (this._voices.length >= this._polyphony) {
      if (this._steal === "none") return null;
      victim = this._voices[0]!;
    }
    const voiceOpts: VoiceOptions = {
      offset: opts.offset,
      duration: opts.duration,
      when: opts.when,
      rate: opts.rate ?? this._rate,
      volume: opts.volume,
      loop: opts.loop ?? this._loop,
      fadeIn: opts.fadeIn ?? this._fadeIn,
      fadeOut: opts.fadeOut ?? this._fadeOut,
    };
    const voice = new Voice(this.context, this.buffer, this._output, voiceOpts, () => this._evict(voice));
    // Push before stealing so the count never dips to 0 on a retrigger — for a
    // polyphony-1 pad, activeVoices is the "is the latest hit playing" signal.
    this._voices.push(voice);
    victim?.stop(); // synchronous finish -> _evict
    this.cells.activeVoices.value = this._voices.length;
    return voice;
  }
```

Update the class doc comment's first paragraph to end with: `Configure polyphony: 1, steal: "oldest", and a short fadeOut for a last-trigger-wins pad.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @audiorective/core test -- --run tests/sampler.test.ts`
Expected: all PASS, including `polyphony 1 + steal 'oldest' restarts (count stays 1)` and `polyphony N overlaps up to N concurrent voices`.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @audiorective/core typecheck
git add packages/core/src/Sampler.ts packages/core/tests/sampler.test.ts
git commit -m "feat(core): Sampler fade defaults; steal keeps activeVoices from dipping to 0

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe"
git log -1
```

---

### Task 3: Reverse playback (`reverseBuffer`, `reverseRegion`, `Sampler.reverse`)

**Files:**

- Create: `packages/core/src/reverseBuffer.ts`
- Modify: `packages/core/src/Sampler.ts`, `packages/core/src/index.ts`
- Test: `packages/core/tests/reverseBuffer.test.ts`, `packages/core/tests/sampler.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces:
  - `reverseBuffer(buffer: AudioBuffer): AudioBuffer` — a new buffer with every channel's samples in reverse order (exported from `@audiorective/core`).
  - `reverseRegion(offset: number, duration: number | undefined, bufferDuration: number): { offset: number; duration: number }` — the same region expressed against the reversed buffer (internal; imported by `Sampler` and its test from `../src/reverseBuffer`).
  - `SamplerOptions.reverse?: boolean`; `sampler.reverse: boolean` accessor.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/reverseBuffer.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { reverseBuffer } from "../src";
import { reverseRegion } from "../src/reverseBuffer";

describe("reverseRegion", () => {
  test("whole buffer maps to whole buffer", () => {
    expect(reverseRegion(0, undefined, 1)).toEqual({ offset: 0, duration: 1 });
  });

  test("a region measured from the original start lands at the mirrored position", () => {
    // original [0.2, 0.5) of a 1 s buffer → reversed [0.5, 0.8)
    expect(reverseRegion(0.2, 0.3, 1)).toEqual({ offset: 0.5, duration: 0.3 });
  });

  test("open-ended region (no duration) runs from the reversed start to the original offset", () => {
    expect(reverseRegion(0.25, undefined, 1)).toEqual({ offset: 0, duration: 0.75 });
  });

  test("a duration past the end is clamped to the buffer", () => {
    expect(reverseRegion(0.8, 5, 1)).toEqual({ offset: 0, duration: 0.2 });
  });

  test("an offset past the end yields an empty region at the reversed end", () => {
    expect(reverseRegion(2, 0.5, 1)).toEqual({ offset: 0, duration: 0 });
  });
});

describe("reverseBuffer", () => {
  test("reverses every channel and keeps length, channels, and sample rate", () => {
    const ctx = new OfflineAudioContext(2, 8, 48000);
    const src = ctx.createBuffer(2, 4, 48000);
    src.getChannelData(0).set([1, 2, 3, 4]);
    src.getChannelData(1).set([5, 6, 7, 8]);
    const out = reverseBuffer(src);
    expect(out).not.toBe(src);
    expect(out.length).toBe(4);
    expect(out.numberOfChannels).toBe(2);
    expect(out.sampleRate).toBe(48000);
    expect(Array.from(out.getChannelData(0))).toEqual([4, 3, 2, 1]);
    expect(Array.from(out.getChannelData(1))).toEqual([8, 7, 6, 5]);
    expect(Array.from(src.getChannelData(0))).toEqual([1, 2, 3, 4]); // source untouched
  });
});
```

Append to the `"Sampler — pad behaviour"` block in `packages/core/tests/sampler.test.ts`:

```ts
test("reverse plays the region backwards, with offset/duration measured from the original start", async () => {
  const out = await renderOffline({ seconds: 0.1, channels: 1, sampleRate: RATE }, async (ctx) => {
    const ramp = ctx.createBuffer(1, RATE * 0.1, RATE); // sample i has value i / length
    const data = ramp.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = i / data.length;
    const p = new Sampler(ctx, { buffer: ramp, reverse: true });
    p.output.connect(ctx.destination);
    p.trigger({ offset: 0.05, duration: 0.025 }); // original values 0.5..0.75, played 0.75 → 0.5
  });
  expect(at(out, 0.0001)).toBeCloseTo(0.75, 2);
  expect(at(out, 0.02)).toBeCloseTo(0.55, 2);
  expect(at(out, 0.03)).toBeCloseTo(0, 3); // region over
});

test("reverse is a live accessor and follows a buffer swap", async () => {
  const out = await renderOffline({ seconds: 0.1, channels: 1, sampleRate: RATE }, async (ctx) => {
    const first = ctx.createBuffer(1, RATE * 0.05, RATE);
    first.getChannelData(0).fill(0.2);
    const p = new Sampler(ctx, { buffer: first });
    p.output.connect(ctx.destination);
    expect(p.reverse).toBe(false);
    p.reverse = true;
    expect(p.reverse).toBe(true);
    p.trigger({ when: 0 }); // reversed `first`
    const second = ctx.createBuffer(1, RATE * 0.05, RATE);
    second.getChannelData(0).set(new Float32Array(RATE * 0.05).map((_, i) => (i < 10 ? 1 : 0)));
    p.buffer = second;
    p.trigger({ when: 0.05 }); // reversed `second`: the 1-samples land at the end of the region
  });
  expect(at(out, 0.01)).toBeCloseTo(0.2, 3);
  expect(at(out, 0.06)).toBeCloseTo(0, 3);
  expect(out.getChannelData(0)[Math.round(0.1 * RATE) - 5]).toBeCloseTo(1, 3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @audiorective/core test -- --run tests/reverseBuffer.test.ts tests/sampler.test.ts`
Expected: `reverseBuffer.test.ts` fails to import; the two Sampler reverse tests FAIL.

- [ ] **Step 3: Create `reverseBuffer.ts`**

```ts
/** A copy of `buffer` with every channel's samples in reverse order. */
export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const out = new AudioBuffer({
    numberOfChannels: buffer.numberOfChannels,
    length: buffer.length,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c).slice();
    data.reverse();
    out.copyToChannel(data, c);
  }
  return out;
}

/**
 * The region `[offset, offset + duration)` of the original buffer, expressed
 * as an offset/duration into its reversed copy. Regions are clamped to the
 * buffer; an offset past the end yields an empty region.
 */
export function reverseRegion(offset: number, duration: number | undefined, bufferDuration: number): { offset: number; duration: number } {
  const start = Math.min(Math.max(0, offset), bufferDuration);
  const end = duration == null ? bufferDuration : Math.min(bufferDuration, start + duration);
  return { offset: bufferDuration - end, duration: end - start };
}
```

- [ ] **Step 4: Wire `reverse` into `Sampler`**

In `packages/core/src/Sampler.ts`:

```ts
import { reverseBuffer, reverseRegion } from "./reverseBuffer";
```

Add to `SamplerOptions`:

```ts
  /** Play voices backwards. `offset`/`duration` still count from the original start. Default false. */
  reverse?: boolean;
```

Add fields:

```ts
  private _reverse: boolean;
  // Reversed copy of `buffer`, rebuilt only when `buffer` changes.
  private _reversed: { source: AudioBuffer; buffer: AudioBuffer } | null = null;
```

Constructor: `this._reverse = opts.reverse ?? false;`

Add the accessor:

```ts
  get reverse(): boolean {
    return this._reverse;
  }

  /** Applies to voices triggered from now on. */
  set reverse(v: boolean) {
    this._reverse = v;
  }
```

In `trigger()`, after the `!this.buffer` guard and before `voiceOpts` is built, resolve the buffer and region:

```ts
let buffer = this.buffer;
let offset = opts.offset;
let duration = opts.duration;
if (this._reverse) {
  if (this._reversed?.source !== buffer) this._reversed = { source: buffer, buffer: reverseBuffer(buffer) };
  buffer = this._reversed.buffer;
  ({ offset, duration } = reverseRegion(opts.offset ?? 0, opts.duration, buffer.duration));
}
```

Then use `offset`, `duration` in `voiceOpts` (instead of `opts.offset` / `opts.duration`) and pass `buffer` (not `this.buffer`) to `new Voice(...)`.

Export from `packages/core/src/index.ts`:

```ts
export { reverseBuffer } from "./reverseBuffer";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @audiorective/core test -- --run tests/reverseBuffer.test.ts tests/sampler.test.ts tests/index.test.ts`
Expected: all PASS. If `tests/index.test.ts` asserts the exact export list, add `reverseBuffer` there.

- [ ] **Step 6: Type-check and commit**

```bash
pnpm --filter @audiorective/core typecheck
git add packages/core/src/reverseBuffer.ts packages/core/src/Sampler.ts packages/core/src/index.ts packages/core/tests/reverseBuffer.test.ts packages/core/tests/sampler.test.ts packages/core/tests/index.test.ts
git commit -m "feat(core): Sampler.reverse with region remapping; export reverseBuffer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe"
git log -1
```

---

### Task 4: `Sampler.params.mute`

**Files:**

- Modify: `packages/core/src/Sampler.ts`
- Test: `packages/core/tests/sampler.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `SamplerOptions.mute?: boolean`; `sampler.params.mute: Param<boolean>`. `sampler.output` is still the volume gain.

- [ ] **Step 1: Write the failing tests**

Append to the `"Sampler — pad behaviour"` block:

```ts
test("mute silences the output without touching queued volume automation", async () => {
  let volumeAtParam = -1;
  const out = await renderOffline({ seconds: 0.2, channels: 1, sampleRate: RATE }, async (ctx) => {
    const p = new Sampler(ctx, { buffer: fullBuffer(ctx, 0.2), mute: true });
    p.output.connect(ctx.destination);
    p.params.volume.setValueAtTime(0.5, 0.1);
    p.trigger();
    volumeAtParam = p.params.volume.read();
  });
  expect(volumeAtParam).toBe(1); // mute is a separate node; the volume AudioParam is untouched
  expect(at(out, 0.05)).toBe(0);
  expect(at(out, 0.15)).toBe(0);
});

test("params.mute toggles live and output stays the volume gain", () => {
  const p = new Sampler(ctx, { buffer: makeBuffer(ctx), volume: 0.5 });
  expect(p.params.mute.value).toBe(false);
  p.params.mute.value = true;
  expect(p.params.mute.value).toBe(true);
  expect((p.output as GainNode).gain.value).toBeCloseTo(0.5); // volume unaffected by mute
  p.params.mute.value = false;
  p.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @audiorective/core test -- --run tests/sampler.test.ts`
Expected: both new tests FAIL (`params.mute` undefined; muted render is not silent).

- [ ] **Step 3: Implement mute**

In `packages/core/src/Sampler.ts`:

Import `Param`: `import type { Param } from "./Param";`

Add to `SamplerOptions`:

```ts
  /** Start muted. Default false. */
  mute?: boolean;
```

Change the class generic to `AudioProcessor<{ volume: SchedulableParam; mute: Param<boolean> }, { activeVoices: Cell<number> }>`.

Add a field `private readonly _voiceSink: GainNode;` and rework the constructor head:

```ts
  constructor(ctx: BaseAudioContext, opts: SamplerOptions = {}) {
    // Voices sum into the mute gain, which feeds the volume gain (the output).
    // Mute lives on its own node so it never disturbs volume automation.
    const muteGain = new GainNode(ctx, { gain: opts.mute ? 0 : 1 });
    const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    muteGain.connect(outputGain);
    super(ctx, ({ param, cell }) => ({
      params: {
        volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }),
        mute: param<boolean>({
          default: opts.mute ?? false,
          bind: {
            set: (m) => {
              muteGain.gain.value = m ? 0 : 1;
            },
          },
        }),
      },
      cells: { activeVoices: cell(0) },
    }));
    this._voiceSink = muteGain;
    this._output = outputGain;
```

In `trigger()`, pass `this._voiceSink` (not `this._output`) as the Voice destination.

In `destroy()`, add `this._voiceSink.disconnect();` before `this._output.disconnect();`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @audiorective/core test -- --run tests/sampler.test.ts tests/renderOffline.test.ts`
Expected: all PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm --filter @audiorective/core typecheck
git add packages/core/src/Sampler.ts packages/core/tests/sampler.test.ts
git commit -m "feat(core): Sampler mute param on its own gain stage

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe"
git log -1
```

---

### Task 5: `loadAudioBuffer` and `AudioBufferCache` accept `BaseAudioContext`

**Files:**

- Modify: `packages/core/src/loadAudioBuffer.ts`
- Test: `packages/core/tests/loadAudioBuffer.test.ts`

**Interfaces:**

- Produces: `loadAudioBuffer(ctx: BaseAudioContext, url: string)`, `new AudioBufferCache(ctx: BaseAudioContext)`.

- [ ] **Step 1: Write the failing test**

Append inside the `describe("loadAudioBuffer")` block:

```ts
test("decodes on an OfflineAudioContext", async () => {
  const offline = new OfflineAudioContext(1, 48000, 48000);
  const fake = offline.createBuffer(1, 1, 48000);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })),
  );
  const decodeSpy = vi.spyOn(offline, "decodeAudioData").mockResolvedValue(fake);
  const buf = await loadAudioBuffer(offline, "/sound.wav");
  expect(decodeSpy).toHaveBeenCalledTimes(1);
  expect(buf).toBe(fake);
  const cache = new AudioBufferCache(offline);
  expect(await cache.load("/sound.wav")).toBe(fake);
});
```

- [ ] **Step 2: Verify the current signature rejects an offline context**

The runtime test above already passes (decoding is the same call on both context types); it stays as a regression guard. The failure to fix is at the type level, and `typecheck` does not cover `tests/`, so prove it with a throwaway source file:

```bash
printf 'import { loadAudioBuffer } from "./index";\nvoid loadAudioBuffer(new OfflineAudioContext(1, 1, 48000), "/x.wav");\n' > packages/core/src/__offline-check.ts
pnpm --filter @audiorective/core typecheck
```

Expected: FAIL with `Argument of type 'OfflineAudioContext' is not assignable to parameter of type 'AudioContext'`. Leave the file in place for Step 4.

- [ ] **Step 3: Widen the types**

In `packages/core/src/loadAudioBuffer.ts` change both `AudioContext` annotations to `BaseAudioContext`:

```ts
export async function loadAudioBuffer(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
```

```ts
  private readonly ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
```

- [ ] **Step 4: Run the type-check and tests, then remove the throwaway file**

```bash
pnpm --filter @audiorective/core typecheck
rm packages/core/src/__offline-check.ts
pnpm --filter @audiorective/core test -- --run tests/loadAudioBuffer.test.ts
```

Expected: typecheck PASS with the throwaway file present; tests PASS.

- [ ] **Step 5: Commit**

```bash
git status --short   # must not list __offline-check.ts
git add packages/core/src/loadAudioBuffer.ts packages/core/tests/loadAudioBuffer.test.ts
git commit -m "feat(core): loadAudioBuffer and AudioBufferCache accept BaseAudioContext

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe"
git log -1
```

---

### Task 6: Docs and changelog

**Files:**

- Modify: `docs/core.md` (Sampler section, ~lines 516–610), `docs/choosing-playback.md`, `CHANGELOG.md`

`skills/audiorective/references/*.md` are symlinks to these files; nothing to copy.

- [ ] **Step 1: Update `docs/core.md`**

In the `### Sampler` options table add rows:

```markdown
| `fadeIn` | `number` | `0` | Default fade-in per voice, seconds |
| `fadeOut` | `number` | `0` | Fade applied when a voice is stopped or stolen |
| `reverse` | `boolean` | `false` | Play backwards; regions still count from the original start |
| `mute` | `boolean` | `false` | Start muted |
```

In the **Polyphony / steal matrix** change the `1` / `"oldest"` row description to: ``Each `trigger()` restarts — classic one-shot pad. Add `fadeOut` so the cut does not click``.

In **Public surface** add after `params.volume`:

```typescript
player.params.mute: Param<boolean>     // separate gain stage; leaves volume automation intact
player.reverse: boolean                // applies to future triggers
```

In **`TriggerOptions`** add:

```typescript
  fadeIn?: number; // seconds; overrides the sampler default
  fadeOut?: number; // seconds; overrides the sampler default
```

After the `TriggerOptions` paragraph add:

````markdown
**Pad recipe.** For a drum pad or soundboard key — one hit at a time, a new hit replaces the old one — use `polyphony: 1`, `steal: "oldest"`, and a short `fadeOut`. `cells.activeVoices` is then the pad's "playing" signal: `1` while the latest hit plays, `0` once it ends or is stopped, and it never drops to `0` while a retrigger supersedes the previous hit. For clock-scheduled dynamics, automate `params.volume` (`setValueAtTime(gain, when)`); values are linear gain, so convert dB with `dbToGain` from `@audiorective/effects`.

```typescript
const pad = new Sampler(ctx, { polyphony: 1, steal: "oldest", fadeOut: 0.05 });
pad.buffer = await cache.load("/pads/snare.wav");
pad.params.volume.setValueAtTime(dbToGain(-6), time);
pad.trigger({ when: time, offset: 0.12, duration: 0.4 });
```
````

````

In the `### Voice` block append to the code sample:

```typescript
// with fadeOut set, stop() finishes the voice now and the audio rings out
````

- [ ] **Step 2: Update `docs/choosing-playback.md`**

Under `### Sampler — the drum pad`, after the **Avoid when** paragraph, add:

```markdown
**Single-voice pad (last trigger wins).** `polyphony: 1` + `steal: "oldest"` + a short `fadeOut`. This is the `Tone.Player` shape for sample pads, metronome clicks, and clip players:

| `Tone.Player`                   | `Sampler`                                                             |
| ------------------------------- | --------------------------------------------------------------------- |
| `start(when, offset, duration)` | `trigger({ when, offset, duration })`                                 |
| `fadeIn` / `fadeOut`            | `fadeIn` / `fadeOut` (constructor default or per trigger)             |
| `reverse`                       | `reverse`                                                             |
| `mute`                          | `params.mute`                                                         |
| `volume` (dB, schedulable)      | `params.volume` (linear, schedulable; `dbToGain` for dB)              |
| `onstop`                        | `cells.activeVoices` → `0`, or `voice.onEnded` on the returned handle |
| `load(url)` / `loaded`          | `AudioBufferCache.load(url)` then `sampler.buffer = …`                |
| `new Tone.Player({ context })`  | `new Sampler(ctx)` — live or `OfflineAudioContext`                    |
```

In the **Quick reference** table, change the `Best for` cell for `Sampler` to `SFX, hits, one-shots, sample pads`.

- [ ] **Step 3: Update `CHANGELOG.md`**

Under `## [Unreleased]` add:

```markdown
### Added

- **core:** `Voice` / `Sampler` fades — `fadeIn` and `fadeOut` (seconds) as
  `SamplerOptions` defaults and `TriggerOptions` overrides. A faded `stop()`
  or steal finishes the voice for callers immediately and lets the audio ring
  out; a scheduled `stop(when)` fades from `when`. (#31)
- **core:** `Sampler.reverse` — plays voices backwards from a cached reversed
  copy of `buffer`; `offset`/`duration` still count from the original start.
  `reverseBuffer(buffer)` is exported for callers that need the copy. (#31)
- **core:** `Sampler.params.mute: Param<boolean>` on its own gain stage, so
  muting leaves queued `params.volume` automation intact. (#31)
- **core:** `loadAudioBuffer` and `AudioBufferCache` accept a
  `BaseAudioContext`, so the same loader serves `renderOffline`. (#31)

### Changed

- **core:** `Sampler.trigger` pushes the new voice before stopping a stolen
  one, so `cells.activeVoices` no longer dips to `0` during a retrigger.
  With `polyphony: 1` the cell is a pad's "latest hit is playing" signal. (#31)
```

- [ ] **Step 4: Format and commit**

```bash
pnpm run format-fix
git add docs/core.md docs/choosing-playback.md CHANGELOG.md
git commit -m "docs: Sampler pad recipe, Tone.Player migration table, changelog for #31

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe"
git log -1
```

---

### Task 7: Full verification and PR

- [ ] **Step 1: Run the whole core suite, lint, and typecheck**

```bash
pnpm --filter @audiorective/core test -- --run
pnpm --filter @audiorective/core typecheck
pnpm run lint
pnpm run build
```

Expected: all green. `build` confirms the effects and demo packages still compile against the widened `Sampler` types.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin feat/sampler-pad
gh pr create --title "core: Sampler as a sample pad — fades, reverse, mute (#31)" --body "$(cat <<'EOF'
Closes #31.

Extends `Sampler`/`Voice` instead of adding a new player: `fadeIn`/`fadeOut`, `reverse` with region remapping, `params.mute` on its own gain stage, steal without an `activeVoices` blip, and `loadAudioBuffer` on `BaseAudioContext`. Docs gain a pad recipe and a `Tone.Player` migration table.

Spec: `docs/superpowers/specs/2026-09-09-sampler-pad-design.md`
Plan: `docs/superpowers/plans/2026-09-09-sampler-pad.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XMMAZPFXMwVn4MbeTdTfpe
EOF
)"
```
