# SoundPlayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a buffer-backed, polyphonic, transport-capable `SoundPlayer` sound source primitive to `@audiorective/core`, plus a `Voice` handle and an `AudioBuffer` loader/cache.

**Architecture:** `SoundPlayer` is an `AudioProcessor` (output-only). It spawns `Voice` objects (each = one `AudioBufferSourceNode → voiceGain`) that sum into the player's output gain. `AudioBufferSourceNode` is one-shot by spec, so pause/resume/seek recreate the source at a computed offset. The player exposes both a polyphonic/SFX API (`trigger()` → `Voice`) and song-style transport (`play/pause/resume/seek/stop`, `currentTime`, reactive `isPlaying`) over a "current voice". `Spatial` composes externally — the player is spatial-agnostic.

**Tech Stack:** TypeScript, Web Audio API, alien-signals (via core `Cell`/`SchedulableParam`), vitest browser mode (chromium, real `AudioContext`), tsdown build.

**Spec:** `docs/superpowers/specs/2026-06-05-sound-player-design.md`

---

## File structure

- Create `packages/core/src/loadAudioBuffer.ts` — `loadAudioBuffer(ctx, url)` + `AudioBufferCache`. Pure fetch/decode helpers, no player coupling.
- Create `packages/core/src/Voice.ts` — `Voice` class (one live voice; owns `BufferSource → voiceGain`). Transient, not user-composed.
- Create `packages/core/src/SoundPlayer.ts` — `SoundPlayer` (`AudioProcessor`), polyphony + transport.
- Modify `packages/core/src/index.ts` — export the new symbols and types.
- Create tests: `packages/core/tests/loadAudioBuffer.test.ts`, `packages/core/tests/voice.test.ts`, `packages/core/tests/soundPlayer.test.ts`.

**Conventions (from the existing codebase):**

- Source files PascalCase (`Voice.ts`), test files lowercase (`voice.test.ts`), mirroring `Cell.ts`/`cell.test.ts`.
- Tests run in a real browser: `pnpm --filter @audiorective/core test -- --run tests/<file>`. Chromium must be installed once: `pnpm --filter @audiorective/core exec playwright install chromium`.
- The AudioContext autoplay arg is already set in `packages/core/vitest.config.ts`; tests still `await ctx.resume()` so `ctx.currentTime` advances.

**Shared test helpers** (paste into each test file that needs them):

```ts
function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

---

## Task 1: AudioBuffer loader + cache

**Files:**

- Create: `packages/core/src/loadAudioBuffer.ts`
- Test: `packages/core/tests/loadAudioBuffer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/loadAudioBuffer.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { loadAudioBuffer, AudioBufferCache } from "../src";

describe("loadAudioBuffer", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = new AudioContext();
  });
  afterEach(() => {
    void ctx.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("fetches the url and decodes the response into an AudioBuffer", async () => {
    const fake = ctx.createBuffer(1, 1, ctx.sampleRate);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })),
    );
    const decodeSpy = vi.spyOn(ctx, "decodeAudioData").mockResolvedValue(fake);

    const buf = await loadAudioBuffer(ctx, "/sound.wav");

    expect(globalThis.fetch).toHaveBeenCalledWith("/sound.wav");
    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(buf).toBe(fake);
  });

  test("throws with the status when the fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(loadAudioBuffer(ctx, "/missing.wav")).rejects.toThrow(/404/);
  });
});

describe("AudioBufferCache", () => {
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = new AudioContext();
  });
  afterEach(() => {
    void ctx.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("dedupes concurrent loads of the same url (one decode, same buffer)", async () => {
    const fake = ctx.createBuffer(1, 1, ctx.sampleRate);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })),
    );
    const decodeSpy = vi.spyOn(ctx, "decodeAudioData").mockResolvedValue(fake);
    const cache = new AudioBufferCache(ctx);

    const p1 = cache.load("/a.wav");
    const p2 = cache.load("/a.wav");
    expect(p1).toBe(p2); // same in-flight promise

    const [b1, b2] = await Promise.all([p1, p2]);
    expect(b1).toBe(b2);
    expect(decodeSpy).toHaveBeenCalledTimes(1);
  });

  test("evicts a failed load so it can be retried", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const cache = new AudioBufferCache(ctx);
    await expect(cache.load("/x.wav")).rejects.toThrow();
    // Second call retries rather than returning the rejected promise.
    await expect(cache.load("/x.wav")).rejects.toThrow();
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/core test -- --run tests/loadAudioBuffer.test.ts`
Expected: FAIL — `loadAudioBuffer`/`AudioBufferCache` are not exported.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/loadAudioBuffer.ts`:

```ts
/** Fetch a URL and decode it into an AudioBuffer on the given context. */
export async function loadAudioBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadAudioBuffer: failed to fetch ${url} (${res.status})`);
  }
  const data = await res.arrayBuffer();
  return ctx.decodeAudioData(data);
}

/**
 * Caches decoded AudioBuffers by URL and dedupes concurrent loads. One decoded
 * buffer can feed many SoundPlayers/voices. Lifetime is explicit — call clear()
 * to release.
 */
export class AudioBufferCache {
  private readonly ctx: AudioContext;
  private readonly cache = new Map<string, Promise<AudioBuffer>>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  load(url: string): Promise<AudioBuffer> {
    let pending = this.cache.get(url);
    if (!pending) {
      pending = loadAudioBuffer(this.ctx, url);
      this.cache.set(url, pending);
      // Drop failed loads so a transient error can be retried.
      pending.catch(() => {
        if (this.cache.get(url) === pending) this.cache.delete(url);
      });
    }
    return pending;
  }

  clear(): void {
    this.cache.clear();
  }
}
```

Add to `packages/core/src/index.ts` (so the test can import):

```ts
export { loadAudioBuffer, AudioBufferCache } from "./loadAudioBuffer";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/core test -- --run tests/loadAudioBuffer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/loadAudioBuffer.ts packages/core/src/index.ts packages/core/tests/loadAudioBuffer.test.ts
git commit -m "feat(core): add loadAudioBuffer + AudioBufferCache"
```

---

## Task 2: Voice — trigger, currentTime, natural end

**Files:**

- Create: `packages/core/src/Voice.ts`
- Test: `packages/core/tests/voice.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/voice.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Voice } from "../src";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Voice — playback", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("starts playing on construction and connects to the destination", () => {
    const dest = ctx.createGain();
    let done = false;
    const v = new Voice(ctx, makeBuffer(ctx), dest, {}, () => {
      done = true;
    });
    expect(v.isPlaying).toBe(true);
    expect(v.duration).toBeGreaterThan(0);
    expect(done).toBe(false);
    v.stop();
  });

  test("currentTime advances roughly with wall-clock", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(150);
    expect(v.currentTime).toBeGreaterThan(0.08);
    expect(v.currentTime).toBeLessThan(0.5);
    v.stop();
  });

  test("currentTime advances ~2x at rate 2", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, { rate: 2 }, () => {});
    await delay(150);
    expect(v.currentTime).toBeGreaterThan(0.18);
    v.stop();
  });

  test("fires onEnded once and calls the onDone hook at natural end", async () => {
    const dest = ctx.createGain();
    let doneCount = 0;
    const v = new Voice(ctx, makeBuffer(ctx, 0.05), dest, {}, () => {
      doneCount++;
    });
    let endedCount = 0;
    v.onEnded(() => {
      endedCount++;
    });
    await delay(200);
    expect(endedCount).toBe(1);
    expect(doneCount).toBe(1);
    expect(v.isPlaying).toBe(false);
  });

  test("onEnded fires once on programmatic stop (not double with natural end)", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 0.5), dest, {}, () => {});
    let endedCount = 0;
    v.onEnded(() => {
      endedCount++;
    });
    v.stop();
    await delay(50);
    expect(endedCount).toBe(1);
    expect(v.isPlaying).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/core test -- --run tests/voice.test.ts`
Expected: FAIL — `Voice` is not exported.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/Voice.ts`:

```ts
export interface VoiceOptions {
  /** Buffer start offset in seconds. Default 0. */
  offset?: number;
  /** Play length in seconds. Default: to end of buffer. */
  duration?: number;
  /** ctx-time to start. Default: now. */
  when?: number;
  /** Playback rate. Default 1. */
  rate?: number;
  /** Per-voice gain. Default 1. */
  volume?: number;
  /** Loop the whole buffer. Default false. */
  loop?: boolean;
}

/**
 * One live voice: an AudioBufferSourceNode feeding a per-voice gain, summed into
 * a destination node. AudioBufferSourceNode is one-shot by spec, so pause/seek
 * recreate the source at a computed offset. Transient — created per trigger,
 * disposed when it ends.
 */
export class Voice {
  private readonly ctx: AudioContext;
  private readonly buffer: AudioBuffer;
  private readonly gain: GainNode;
  private readonly playLength: number | undefined;
  private readonly onDone: () => void;

  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0; // ctx time the current source started
  private offset: number; // buffer offset the current source started from
  private _rate: number; // underscored: `rate` is a public setter (Task 3)
  private loop: boolean;
  private paused = false;
  private ended = false;
  private endedCbs: Array<() => void> = [];

  constructor(ctx: AudioContext, buffer: AudioBuffer, destination: AudioNode, opts: VoiceOptions, onDone: () => void) {
    this.ctx = ctx;
    this.buffer = buffer;
    this.onDone = onDone;
    this.offset = opts.offset ?? 0;
    this._rate = opts.rate ?? 1;
    this.loop = opts.loop ?? false;
    this.playLength = opts.duration;
    this.gain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    this.gain.connect(destination);
    this.startSource(opts.when ?? ctx.currentTime, this.offset);
  }

  get duration(): number {
    return this.buffer.duration;
  }

  get isPlaying(): boolean {
    return !this.paused && !this.ended;
  }

  get currentTime(): number {
    if (this.paused || this.ended) return this.offset;
    const elapsed = Math.max(0, this.ctx.currentTime - this.startedAt) * this._rate;
    let t = this.offset + elapsed;
    if (this.loop) {
      const len = this.buffer.duration;
      t = len > 0 ? t % len : 0;
    } else {
      t = Math.min(t, this.buffer.duration);
    }
    return t;
  }

  stop(when?: number): void {
    if (this.ended) return;
    if (when != null && when > this.ctx.currentTime && this.source) {
      // Scheduled stop: let it play to `when`; the current source's onended finalizes.
      try {
        this.source.stop(when);
      } catch {
        /* already stopped */
      }
      return;
    }
    this.teardownCurrent();
    this.finish();
  }

  onEnded(cb: () => void): void {
    if (this.ended) cb();
    else this.endedCbs.push(cb);
  }

  private startSource(when: number, offset: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.playbackRate.value = this._rate;
    src.connect(this.gain);
    src.onended = () => {
      // Ignore the onended of a source we already tore down (pause/seek/rate).
      if (src !== this.source) return;
      this.finish();
    };
    if (this.playLength != null) src.start(when, offset, this.playLength);
    else src.start(when, offset);
    this.source = src;
    this.startedAt = when;
    this.offset = offset;
    this.paused = false;
  }

  private teardownCurrent(): void {
    const src = this.source;
    this.source = null; // do this first so the stale onended is ignored
    if (src) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.paused = false;
    this.teardownCurrent();
    this.gain.disconnect();
    const cbs = this.endedCbs;
    this.endedCbs = [];
    for (const cb of cbs) cb();
    this.onDone();
  }
}
```

Add to `packages/core/src/index.ts`:

```ts
export { Voice } from "./Voice";
export type { VoiceOptions } from "./Voice";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/core test -- --run tests/voice.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/Voice.ts packages/core/src/index.ts packages/core/tests/voice.test.ts
git commit -m "feat(core): add Voice (trigger, currentTime, natural end)"
```

---

## Task 3: Voice — pause, resume, seek, rate, volume

**Files:**

- Modify: `packages/core/src/Voice.ts`
- Test: `packages/core/tests/voice.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/tests/voice.test.ts`:

```ts
describe("Voice — transport", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("pause freezes currentTime; resume continues from the saved offset", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    await delay(120);
    v.pause();
    expect(v.isPlaying).toBe(false);
    const frozen = v.currentTime;
    expect(frozen).toBeGreaterThan(0.05);
    await delay(120);
    expect(v.currentTime).toBeCloseTo(frozen, 2); // unchanged while paused
    v.resume();
    expect(v.isPlaying).toBe(true);
    await delay(120);
    expect(v.currentTime).toBeGreaterThan(frozen + 0.05);
    v.stop();
  });

  test("pause does not fire onEnded", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 2), dest, {}, () => {});
    let ended = 0;
    v.onEnded(() => {
      ended++;
    });
    await delay(60);
    v.pause();
    await delay(80);
    expect(ended).toBe(0);
    v.stop();
  });

  test("seek jumps currentTime (while playing and while paused)", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {});
    v.seek(3);
    expect(v.currentTime).toBeGreaterThan(2.9);
    expect(v.currentTime).toBeLessThan(3.3);
    v.pause();
    v.seek(1);
    expect(v.currentTime).toBeCloseTo(1, 2);
    v.stop();
  });

  test("seek clamps to [0, duration]", () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 1), dest, {}, () => {});
    v.pause();
    v.seek(-5);
    expect(v.currentTime).toBe(0);
    v.seek(99);
    expect(v.currentTime).toBeCloseTo(1, 2);
    v.stop();
  });

  test("rate change while playing keeps currentTime continuous", async () => {
    const dest = ctx.createGain();
    const v = new Voice(ctx, makeBuffer(ctx, 5), dest, {}, () => {});
    await delay(120);
    const before = v.currentTime;
    v.rate = 3;
    const after = v.currentTime;
    expect(after).toBeCloseTo(before, 1); // no jump at the moment of change
    await delay(120);
    expect(v.currentTime).toBeGreaterThan(before + 0.2); // faster now
    v.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/core test -- --run tests/voice.test.ts`
Expected: FAIL — `pause`/`resume`/`seek`/`rate` are not defined on `Voice`.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/Voice.ts`, add these methods inside the class (after `onEnded`):

```ts
  pause(): void {
    if (this.paused || this.ended || !this.source) return;
    this.offset = this.currentTime; // capture before tearing down
    this.paused = true;
    this.teardownCurrent();
  }

  resume(): void {
    if (!this.paused || this.ended) return;
    this.startSource(this.ctx.currentTime, this.offset);
  }

  seek(t: number): void {
    if (this.ended) return;
    const clamped = Math.max(0, Math.min(t, this.buffer.duration));
    if (this.paused) {
      this.offset = clamped;
      return;
    }
    this.teardownCurrent();
    this.startSource(this.ctx.currentTime, clamped);
  }

  set volume(v: number) {
    this.gain.gain.value = v;
  }

  set rate(v: number) {
    if (this.ended) return;
    if (this.paused || !this.source) {
      this._rate = v;
      return;
    }
    // Rebase the offset baseline so currentTime stays continuous across the change.
    this.offset = this.currentTime;
    this.startedAt = this.ctx.currentTime;
    this._rate = v;
    this.source.playbackRate.value = v;
  }
```

Note: the private field is `_rate` (declared in Task 2); the public `rate` setter writes it. `volume` is a set-only accessor writing `this.gain.gain.value` — there is no `volume` field and no getter, which is intentional.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/core test -- --run tests/voice.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/Voice.ts packages/core/tests/voice.test.ts
git commit -m "feat(core): Voice pause/resume/seek/rate/volume"
```

---

## Task 4: SoundPlayer — trigger, polyphony, stopAll

**Files:**

- Create: `packages/core/src/SoundPlayer.ts`
- Test: `packages/core/tests/soundPlayer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/soundPlayer.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { SoundPlayer } from "../src";

function makeBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("SoundPlayer — trigger & polyphony", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode and volume param drives it", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx), volume: 0.5 });
    expect(p.output).toBeInstanceOf(AudioNode);
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.5);
    p.params.volume.value = 0.25;
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.25);
    p.destroy();
  });

  test("trigger with no buffer returns null", () => {
    const p = new SoundPlayer(ctx);
    expect(p.trigger()).toBeNull();
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("trigger spawns a voice and increments activeVoices", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    const v = p.trigger();
    expect(v).not.toBeNull();
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("polyphony 1 + steal 'oldest' restarts (count stays 1)", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 1, steal: "oldest" });
    p.trigger();
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    p.destroy();
  });

  test("polyphony 1 + steal 'none' drops the retrigger", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 1, steal: "none" });
    expect(p.trigger()).not.toBeNull();
    expect(p.trigger()).toBeNull();
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    p.destroy();
  });

  test("polyphony N overlaps up to N concurrent voices", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2), polyphony: 3 });
    p.trigger();
    p.trigger();
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(3);
    p.trigger(); // steal oldest, still 3
    expect(p.cells.activeVoices.value).toBe(3);
    p.stopAll();
    p.destroy();
  });

  test("a voice that ends naturally is evicted from the pool", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 0.05), polyphony: 4 });
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(1);
    await delay(200);
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("buffer is hot-swappable for future triggers", () => {
    const p = new SoundPlayer(ctx);
    expect(p.trigger()).toBeNull();
    p.buffer = makeBuffer(ctx, 1);
    expect(p.trigger()).not.toBeNull();
    p.stopAll();
    p.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/core test -- --run tests/soundPlayer.test.ts`
Expected: FAIL — `SoundPlayer` is not exported.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/SoundPlayer.ts`:

```ts
import { AudioProcessor } from "./AudioProcessor";
import type { SchedulableParam } from "./SchedulableParam";
import type { Cell } from "./Cell";
import { Voice, type VoiceOptions } from "./Voice";

export interface SoundPlayerOptions {
  /** Decoded sample. Settable later via `.buffer`. */
  buffer?: AudioBuffer;
  /** Default loop for new voices. Default false. */
  loop?: boolean;
  /** Default playback rate for new voices. Default 1. */
  playbackRate?: number;
  /** Player output gain (0..1). Default 1. */
  volume?: number;
  /** Max concurrent voices. Default 1. */
  polyphony?: number;
  /** At the cap: stop the oldest then spawn, or drop the new trigger. Default "oldest". */
  steal?: "oldest" | "none";
}

export type TriggerOptions = VoiceOptions;

/**
 * Buffer-backed, polyphonic sound source. Spawns Voices that sum into the
 * player output. Exposes a polyphonic/SFX API (trigger -> Voice) and song-style
 * transport (play/pause/resume/seek/stop) over a "current voice". Spatial
 * composes externally via `player.output -> spatial.input`.
 */
export class SoundPlayer extends AudioProcessor<{ volume: SchedulableParam }, { isPlaying: Cell<boolean>; activeVoices: Cell<number> }> {
  buffer: AudioBuffer | null;

  private readonly _output: GainNode;
  private readonly _loop: boolean;
  private readonly _rate: number;
  private readonly _polyphony: number;
  private readonly _steal: "oldest" | "none";
  private _voices: Voice[] = [];
  private _current: Voice | null = null;

  constructor(ctx: AudioContext, opts: SoundPlayerOptions = {}) {
    const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    super(ctx, ({ param, cell }) => ({
      params: { volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }) },
      cells: { isPlaying: cell(false), activeVoices: cell(0) },
    }));
    this._output = outputGain;
    this.buffer = opts.buffer ?? null;
    this._loop = opts.loop ?? false;
    this._rate = opts.playbackRate ?? 1;
    this._polyphony = Math.max(1, opts.polyphony ?? 1);
    this._steal = opts.steal ?? "oldest";
  }

  get output(): AudioNode {
    return this._output;
  }

  get currentTime(): number {
    return this._current?.currentTime ?? 0;
  }

  get duration(): number {
    return this._current?.duration ?? this.buffer?.duration ?? 0;
  }

  trigger(opts: TriggerOptions = {}): Voice | null {
    if (!this.buffer) {
      console.warn("SoundPlayer.trigger: no buffer set");
      return null;
    }
    if (this._voices.length >= this._polyphony) {
      if (this._steal === "none") return null;
      this._voices[0]!.stop(); // synchronous finish -> _evict
    }
    const voiceOpts: VoiceOptions = {
      offset: opts.offset,
      duration: opts.duration,
      when: opts.when,
      rate: opts.rate ?? this._rate,
      volume: opts.volume,
      loop: opts.loop ?? this._loop,
    };
    const voice = new Voice(this.context, this.buffer, this._output, voiceOpts, () => this._evict(voice));
    this._voices.push(voice);
    this._current = voice;
    this.cells.activeVoices.value = this._voices.length;
    this.cells.isPlaying.value = true;
    return voice;
  }

  stopAll(when?: number): void {
    for (const v of [...this._voices]) v.stop(when);
    this._current = null;
    this.cells.isPlaying.value = false;
  }

  override destroy(): void {
    this.stopAll();
    this._output.disconnect();
    super.destroy();
  }

  private _evict(voice: Voice): void {
    const i = this._voices.indexOf(voice);
    if (i !== -1) this._voices.splice(i, 1);
    if (this._current === voice) {
      this._current = null;
      this.cells.isPlaying.value = false;
    }
    this.cells.activeVoices.value = this._voices.length;
  }
}
```

Add to `packages/core/src/index.ts`:

```ts
export { SoundPlayer } from "./SoundPlayer";
export type { SoundPlayerOptions, TriggerOptions } from "./SoundPlayer";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/core test -- --run tests/soundPlayer.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/SoundPlayer.ts packages/core/src/index.ts packages/core/tests/soundPlayer.test.ts
git commit -m "feat(core): add SoundPlayer (trigger, polyphony, stopAll)"
```

---

## Task 5: SoundPlayer — transport (play/pause/resume/seek/stop)

**Files:**

- Modify: `packages/core/src/SoundPlayer.ts`
- Test: `packages/core/tests/soundPlayer.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `packages/core/tests/soundPlayer.test.ts`:

```ts
describe("SoundPlayer — transport", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("play starts the current voice and sets isPlaying", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    const v = p.play();
    expect(v).not.toBeNull();
    expect(p.cells.isPlaying.value).toBe(true);
    expect(p.cells.activeVoices.value).toBe(1);
    p.stop();
    p.destroy();
  });

  test("play is a no-op while already playing (same voice, no new voice)", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 2) });
    const v1 = p.play();
    const v2 = p.play();
    expect(v2).toBe(v1);
    expect(p.cells.activeVoices.value).toBe(1);
    p.stop();
    p.destroy();
  });

  test("pause then play resumes the same voice and continues", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 3) });
    const v1 = p.play();
    await delay(120);
    p.pause();
    expect(p.cells.isPlaying.value).toBe(false);
    const at = p.currentTime;
    const v2 = p.play();
    expect(v2).toBe(v1); // resumed, not a fresh voice
    expect(p.cells.isPlaying.value).toBe(true);
    await delay(120);
    expect(p.currentTime).toBeGreaterThan(at + 0.05);
    p.stop();
    p.destroy();
  });

  test("stop then play starts fresh from 0", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 3) });
    p.play();
    await delay(120);
    p.stop();
    expect(p.cells.isPlaying.value).toBe(false);
    expect(p.currentTime).toBe(0);
    p.play();
    expect(p.currentTime).toBeLessThan(0.08); // restarted near 0
    p.stop();
    p.destroy();
  });

  test("seek moves the current voice position", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 5) });
    p.play();
    p.seek(3);
    expect(p.currentTime).toBeGreaterThan(2.9);
    expect(p.currentTime).toBeLessThan(3.3);
    p.stop();
    p.destroy();
  });

  test("isPlaying flips back to false when the voice ends naturally", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 0.05) });
    p.play();
    expect(p.cells.isPlaying.value).toBe(true);
    await delay(200);
    expect(p.cells.isPlaying.value).toBe(false);
    expect(p.currentTime).toBe(0);
    p.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/core test -- --run tests/soundPlayer.test.ts`
Expected: FAIL — `play`/`pause`/`resume`/`seek`/`stop` are not defined on `SoundPlayer`.

- [ ] **Step 3: Write minimal implementation**

In `packages/core/src/SoundPlayer.ts`, add these methods inside the class (after `get duration()` and before `trigger`):

```ts
  /** Resume if paused, start fresh if stopped/none, no-op if already playing. */
  play(opts: TriggerOptions = {}): Voice | null {
    if (this._current) {
      if (this._current.isPlaying) return this._current;
      this._current.resume();
      this.cells.isPlaying.value = true;
      return this._current;
    }
    return this.trigger(opts);
  }

  pause(): void {
    this._current?.pause();
    this.cells.isPlaying.value = false;
  }

  resume(): void {
    if (!this._current) return;
    this._current.resume();
    this.cells.isPlaying.value = true;
  }

  seek(t: number): void {
    this._current?.seek(t);
  }

  stop(when?: number): void {
    const current = this._current;
    this._current = null;
    this.cells.isPlaying.value = false;
    current?.stop(when); // finish -> _evict (already cleared _current, so it no-ops there)
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/core test -- --run tests/soundPlayer.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/SoundPlayer.ts packages/core/tests/soundPlayer.test.ts
git commit -m "feat(core): SoundPlayer transport (play/pause/resume/seek/stop)"
```

---

## Task 6: Public exports verification + build/typecheck

**Files:**

- Modify: `packages/core/tests/index.test.ts` (add export assertions)
- Verify: `packages/core/src/index.ts` (already updated across Tasks 1–5)

- [ ] **Step 1: Write the failing test**

Open `packages/core/tests/index.test.ts` and add this block at the end of the top-level `describe` (or as a new `describe`):

```ts
describe("SoundPlayer exports", () => {
  test("exposes SoundPlayer, Voice, loadAudioBuffer, AudioBufferCache", async () => {
    const mod = await import("../src");
    expect(typeof mod.SoundPlayer).toBe("function");
    expect(typeof mod.Voice).toBe("function");
    expect(typeof mod.loadAudioBuffer).toBe("function");
    expect(typeof mod.AudioBufferCache).toBe("function");
  });
});
```

If `describe` is not already imported at the top of `index.test.ts`, add it to the existing `import { ... } from "vitest";` line.

- [ ] **Step 2: Run test to verify it passes (exports already added in Tasks 1–5)**

Run: `pnpm --filter @audiorective/core test -- --run tests/index.test.ts`
Expected: PASS. (If any export is missing, add the corresponding line to `packages/core/src/index.ts` — see Tasks 1, 2, 4 — then rerun.)

- [ ] **Step 3: Full core test + typecheck + build**

Run: `pnpm --filter @audiorective/core test -- --run`
Expected: PASS (all core tests, including the three new files).

Run: `pnpm --filter @audiorective/core run typecheck`
Expected: no output (success).

Run: `pnpm --filter @audiorective/core run build`
Expected: `Build complete` with `dist/index.js` + `dist/index.d.ts` written.

- [ ] **Step 4: Lint + format the new files**

Run: `pnpm exec oxlint --type-aware packages/core/src/loadAudioBuffer.ts packages/core/src/Voice.ts packages/core/src/SoundPlayer.ts packages/core/tests/loadAudioBuffer.test.ts packages/core/tests/voice.test.ts packages/core/tests/soundPlayer.test.ts`
Expected: `Found 0 warnings and 0 errors.`

Run: `pnpm exec prettier --write "packages/core/src/{loadAudioBuffer,Voice,SoundPlayer}.ts" "packages/core/tests/{loadAudioBuffer,voice,soundPlayer}.test.ts" packages/core/src/index.ts`
Expected: files formatted (the pre-commit hook also enforces this).

- [ ] **Step 5: Commit**

```bash
git add packages/core/tests/index.test.ts packages/core/src/index.ts
git commit -m "test(core): assert SoundPlayer public exports"
```

---

## Verification (end to end)

After all tasks:

- `pnpm -r run build` — whole workspace builds (core's new exports don't break dependents).
- `pnpm -r run typecheck` — clean.
- `pnpm --filter @audiorective/core test -- --run` — all core tests green.

Manual smoke (optional, ask the user to start the dev server per their CLAUDE.md — do not start it yourself): in any example or a scratch page, `loadAudioBuffer(engine.context, url)` → `new SoundPlayer(ctx, { buffer })` → wire `player.output` to `engine.spatial.input` → `player.play()` and confirm sound + that `player.seek()`/`player.pause()` behave. (A dedicated showroom example is future work, not part of this plan.)

## Notes for the implementer

- **Web Audio is one-shot:** never call `start()` twice on an `AudioBufferSourceNode`. Every pause/resume/seek/rate-change creates a _new_ source. The `src !== this.source` guard in `Voice` is what prevents a torn-down source's late `onended` from finalizing the voice — do not remove it.
- **Browser test timing:** `currentTime` assertions use wall-clock `delay()` with loose bounds because CI timing varies; keep the tolerances generous (don't tighten them).
- **Context lifecycle in tests:** each test makes its own `AudioContext` and `await ctx.resume()`; close it in `afterEach`. Browsers cap the number of live `AudioContext`s, so closing matters.
- **Do not free the buffer:** `SoundPlayer` never closes or frees `this.buffer` — it's shared and caller-owned.

```

```
