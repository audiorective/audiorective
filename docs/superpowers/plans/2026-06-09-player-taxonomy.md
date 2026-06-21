# Player Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split playback into two clear core primitives — slim `SoundPlayer` to a polyphonic "pad" (no transport), add `StreamPlayer` (a streaming "track" with transport), and refactor the showroom `MusicPlayer` to wrap `StreamPlayer`.

**Architecture:** `SoundPlayer` (buffer, polyphonic, `trigger()`→`Voice`) loses its player-level transport — `Voice` keeps per-voice transport as the escape hatch. `StreamPlayer` wraps `HTMLAudioElement → MediaElementAudioSourceNode → outputGain` with native `play/pause/seek/stop`, an `onEnded` hook, and reactive `isPlaying`/`currentTime`/`duration` cells. The shared `MusicPlayer` becomes composition: `StreamPlayer` + `EQ3` + playlist, keeping its public API so demos are untouched.

**Tech Stack:** TypeScript, Web Audio API (AudioBufferSourceNode, MediaElementAudioSourceNode), alien-signals (`Cell`/`SchedulableParam`/`effect`), vitest browser mode (chromium, real `AudioContext`), tsdown.

**Spec:** `docs/superpowers/specs/2026-06-09-player-taxonomy-design.md`

**Branch:** `claude/core-sound-player` (combined PR #12). Tests run serially (`fileParallelism: false` already set in `packages/core/vitest.config.ts`), headless. Run a single file with `pnpm --filter @audiorective/core test -- --run tests/<file>`.

---

## File structure

- Modify `packages/core/src/SoundPlayer.ts` — remove transport; pad-only.
- Rewrite `packages/core/tests/soundPlayer.test.ts` — pad-only tests.
- Create `packages/core/src/StreamPlayer.ts` — the track.
- Create `packages/core/tests/streamPlayer.test.ts`.
- Modify `packages/core/src/index.ts` — export `StreamPlayer` + `StreamPlayerOptions`.
- Rewrite `apps/showroom/src/shared/audio/MusicPlayer.ts` — wrap `StreamPlayer`.
- `Voice.ts` / `Voice` tests — unchanged.

---

## Task 1: Slim SoundPlayer to a pad

**Files:**

- Modify: `packages/core/src/SoundPlayer.ts`
- Rewrite: `packages/core/tests/soundPlayer.test.ts`

- [ ] **Step 1: Replace the test file** `packages/core/tests/soundPlayer.test.ts` with EXACTLY this (pad-only; drops all transport tests, adds an API-surface assertion):

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

  test("stopAll(when) in the future evicts only after it fires", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 5), polyphony: 2 });
    p.trigger();
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(2);
    await delay(20);
    p.stopAll(ctx.currentTime + 0.08);
    expect(p.cells.activeVoices.value).toBe(2); // still audible during the window
    await delay(400);
    expect(p.cells.activeVoices.value).toBe(0);
    p.destroy();
  });

  test("a looping voice is not auto-evicted (stays active)", async () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 0.05), loop: true });
    p.trigger();
    expect(p.cells.activeVoices.value).toBe(1);
    await delay(250);
    expect(p.cells.activeVoices.value).toBe(1);
    p.stopAll();
    p.destroy();
  });

  test("the pad has no transport API (trigger-only)", () => {
    const p = new SoundPlayer(ctx, { buffer: makeBuffer(ctx, 1) });
    const api = p as unknown as Record<string, unknown>;
    expect(api.play).toBeUndefined();
    expect(api.pause).toBeUndefined();
    expect(api.resume).toBeUndefined();
    expect(api.seek).toBeUndefined();
    expect(api.stop).toBeUndefined();
    expect((p.cells as Record<string, unknown>).isPlaying).toBeUndefined();
    p.destroy();
  });
});
```

- [ ] **Step 2: Run the tests — the API-surface test must FAIL**

Run: `pnpm --filter @audiorective/core test -- --run tests/soundPlayer.test.ts`
Expected: FAIL — "the pad has no transport API" fails because `play`/`pause`/etc. still exist on the current `SoundPlayer`. (Other tests pass.)

- [ ] **Step 3: Replace `packages/core/src/SoundPlayer.ts` with EXACTLY this (slim pad):**

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
 * Buffer-backed, polyphonic sound source — the "drum pad". You hit it: each
 * `trigger()` fires a new Voice (up to `polyphony`, then `steal` applies), and
 * voices sum into the player output. No transport/playhead — for SFX,
 * one-shots, and loops. For a single moving playhead (music), use StreamPlayer.
 *
 * Per-voice control (stop/pause/seek) lives on the returned `Voice`. Spatial/EQ
 * compose externally via `player.output -> ...`.
 */
export class SoundPlayer extends AudioProcessor<{ volume: SchedulableParam }, { activeVoices: Cell<number> }> {
  buffer: AudioBuffer | null;

  private readonly _output: GainNode;
  private readonly _loop: boolean;
  private readonly _rate: number;
  private readonly _polyphony: number;
  private readonly _steal: "oldest" | "none";
  private _voices: Voice[] = [];

  constructor(ctx: AudioContext, opts: SoundPlayerOptions = {}) {
    const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    super(ctx, ({ param, cell }) => ({
      params: { volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }) },
      cells: { activeVoices: cell(0) },
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

  /** Fire a new voice. Returns the Voice, or null if no buffer / dropped by steal:"none". */
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
    this.cells.activeVoices.value = this._voices.length;
    return voice;
  }

  stopAll(when?: number): void {
    // Cell updates are driven by each voice's _evict callback, so activeVoices
    // stays accurate for future-dated stops (voices keep playing until `when`).
    for (const v of [...this._voices]) v.stop(when);
  }

  override destroy(): void {
    this.stopAll();
    this._output.disconnect();
    super.destroy();
  }

  private _evict(voice: Voice): void {
    const i = this._voices.indexOf(voice);
    if (i !== -1) this._voices.splice(i, 1);
    this.cells.activeVoices.value = this._voices.length;
  }
}
```

- [ ] **Step 4: Run the tests — all pass**

Run: `pnpm --filter @audiorective/core test -- --run tests/soundPlayer.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/SoundPlayer.ts packages/core/tests/soundPlayer.test.ts
git commit -m "refactor(core): slim SoundPlayer to a polyphonic pad (drop player transport)"
```

---

## Task 2: StreamPlayer (the track)

**Files:**

- Create: `packages/core/src/StreamPlayer.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/streamPlayer.test.ts`

- [ ] **Step 1: Create `packages/core/tests/streamPlayer.test.ts` with EXACTLY:**

```ts
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { StreamPlayer } from "../src";

/** Build a valid silent WAV data URI so a real <audio> element can load + play it. */
function wavDataUri(seconds = 0.3, sampleRate = 8000): string {
  const n = Math.max(1, Math.floor(seconds * sampleRate));
  const bytes = 44 + n * 2;
  const ab = new ArrayBuffer(bytes);
  const dv = new DataView(ab);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  dv.setUint32(4, bytes - 8, true);
  w(8, "WAVE");
  w(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  w(36, "data");
  dv.setUint32(40, n * 2, true);
  // samples left as zero (silence)
  let bin = "";
  const u8 = new Uint8Array(ab);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return "data:audio/wav;base64," + btoa(bin);
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function once(el: HTMLMediaElement, type: string, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    el.addEventListener(
      type,
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

describe("StreamPlayer", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("output is an AudioNode and volume param drives it", () => {
    const p = new StreamPlayer(ctx, { volume: 0.5 });
    expect(p.output).toBeInstanceOf(AudioNode);
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.5);
    p.params.volume.value = 0.25;
    expect((p.output as GainNode).gain.value).toBeCloseTo(0.25);
    p.destroy();
  });

  test("loadedmetadata populates the duration cell", async () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(0.3) });
    await once(p.audio, "loadedmetadata");
    expect(p.cells.duration.value).toBeGreaterThan(0.2);
    expect(p.cells.duration.value).toBeLessThan(0.6);
    p.destroy();
  });

  test("play sets isPlaying; pause clears it", async () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(2) });
    await once(p.audio, "loadedmetadata");
    await p.play();
    expect(p.cells.isPlaying.value).toBe(true);
    p.pause();
    await delay(30);
    expect(p.cells.isPlaying.value).toBe(false);
    p.destroy();
  });

  test("seek sets currentTime and clamps to duration", async () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(2) });
    await once(p.audio, "loadedmetadata");
    p.seek(1);
    expect(p.cells.currentTime.value).toBeCloseTo(1, 1);
    p.seek(99);
    expect(p.cells.currentTime.value).toBeLessThanOrEqual(p.cells.duration.value + 0.01);
    p.destroy();
  });

  test("stop pauses and rewinds to 0", async () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(2) });
    await once(p.audio, "loadedmetadata");
    p.seek(0.5);
    p.stop();
    expect(p.cells.isPlaying.value).toBe(false);
    expect(p.cells.currentTime.value).toBe(0);
    p.destroy();
  });

  test("loop sets audio.loop", () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(1), loop: true });
    expect(p.audio.loop).toBe(true);
    p.loop = false;
    expect(p.audio.loop).toBe(false);
    p.destroy();
  });

  test("onEnded fires once when a non-looping clip finishes", async () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(0.3) });
    let ended = 0;
    p.onEnded(() => {
      ended++;
    });
    await once(p.audio, "loadedmetadata");
    await p.play();
    await once(p.audio, "ended", 4000);
    expect(ended).toBe(1);
    expect(p.cells.isPlaying.value).toBe(false);
    p.destroy();
  });

  test("setting src resets currentTime and duration", async () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(2) });
    await once(p.audio, "loadedmetadata");
    p.seek(1);
    expect(p.cells.currentTime.value).toBeCloseTo(1, 1);
    p.src = wavDataUri(0.3);
    expect(p.cells.currentTime.value).toBe(0);
    expect(Number.isNaN(p.cells.duration.value)).toBe(true);
    p.destroy();
  });

  test("destroy disconnects without throwing", () => {
    const p = new StreamPlayer(ctx, { src: wavDataUri(1) });
    expect(() => p.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it FAILS**

Run: `pnpm --filter @audiorective/core test -- --run tests/streamPlayer.test.ts`
Expected: FAIL — `StreamPlayer` is not exported.

- [ ] **Step 3: Create `packages/core/src/StreamPlayer.ts` with EXACTLY:**

```ts
import { AudioProcessor } from "./AudioProcessor";
import type { SchedulableParam } from "./SchedulableParam";
import type { Cell } from "./Cell";

export interface StreamPlayerOptions {
  /** Stream URL. Settable later via `.src`. */
  src?: string;
  /** Loop the stream (sets audio.loop). Default false. */
  loop?: boolean;
  /** Output gain (0..1). Default 1. */
  volume?: number;
  /** Playback rate. Default 1. */
  playbackRate?: number;
  /** Element crossOrigin (needed for MediaElementSource on remote URLs). Default "anonymous". */
  crossOrigin?: string | null;
  /** Element preload hint. Default "metadata". */
  preload?: "none" | "metadata" | "auto";
}

/**
 * Streaming sound source — the "track". You operate it: play/pause/seek/stop
 * over a single moving playhead, with reactive isPlaying/currentTime/duration.
 * Backed by an HTMLAudioElement (streams; no full decode) — for music and
 * long-form audio. For polyphonic SFX, use SoundPlayer. Spatial/EQ compose
 * externally via `player.output -> ...`.
 */
export class StreamPlayer extends AudioProcessor<
  { volume: SchedulableParam },
  { isPlaying: Cell<boolean>; currentTime: Cell<number>; duration: Cell<number> }
> {
  readonly audio: HTMLAudioElement;

  private readonly _output: GainNode;
  private readonly _disposers: Array<() => void> = [];
  private readonly _endedCbs: Array<() => void> = [];
  private _src: string | null = null;

  constructor(ctx: AudioContext, opts: StreamPlayerOptions = {}) {
    const audio = new Audio();
    audio.crossOrigin = opts.crossOrigin === undefined ? "anonymous" : opts.crossOrigin;
    audio.preload = opts.preload ?? "metadata";
    audio.loop = opts.loop ?? false;
    audio.playbackRate = opts.playbackRate ?? 1;

    const source = ctx.createMediaElementSource(audio);
    const outputGain = new GainNode(ctx, { gain: opts.volume ?? 1 });
    source.connect(outputGain);

    super(ctx, ({ param, cell }) => ({
      params: { volume: param({ default: opts.volume ?? 1, bind: outputGain.gain, min: 0, max: 1 }) },
      cells: { isPlaying: cell(false), currentTime: cell(0), duration: cell(NaN) },
    }));

    this.audio = audio;
    this._output = outputGain;

    const on = (type: string, fn: () => void) => {
      audio.addEventListener(type, fn);
      this._disposers.push(() => audio.removeEventListener(type, fn));
    };
    on("play", () => {
      this.cells.isPlaying.value = true;
    });
    on("playing", () => {
      this.cells.isPlaying.value = true;
    });
    on("pause", () => {
      this.cells.isPlaying.value = false;
    });
    on("timeupdate", () => {
      this.cells.currentTime.value = audio.currentTime;
    });
    on("seeking", () => {
      this.cells.currentTime.value = audio.currentTime;
    });
    on("loadedmetadata", () => {
      this.cells.duration.value = audio.duration;
    });
    on("ended", () => {
      this.cells.isPlaying.value = false;
      for (const cb of [...this._endedCbs]) cb();
    });

    if (opts.src != null) this.src = opts.src;
  }

  get output(): AudioNode {
    return this._output;
  }

  get src(): string | null {
    return this._src;
  }

  set src(url: string | null) {
    this._src = url;
    this.audio.pause();
    if (url == null) this.audio.removeAttribute("src");
    else this.audio.src = url;
    this.audio.load();
    this.cells.currentTime.value = 0;
    this.cells.duration.value = NaN;
  }

  set loop(v: boolean) {
    this.audio.loop = v;
  }

  set playbackRate(v: number) {
    this.audio.playbackRate = v;
  }

  async play(): Promise<void> {
    if (!this.audio.src) return;
    try {
      await this.audio.play();
    } catch {
      // autoplay gesture pending; caller can retry
    }
  }

  pause(): void {
    this.audio.pause();
  }

  seek(t: number): void {
    const d = this.audio.duration;
    const clamped = Math.max(0, Number.isFinite(d) ? Math.min(d, t) : t);
    this.audio.currentTime = clamped;
    this.cells.currentTime.value = this.audio.currentTime;
  }

  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.cells.currentTime.value = 0;
  }

  onEnded(cb: () => void): void {
    this._endedCbs.push(cb);
  }

  override destroy(): void {
    this.audio.pause();
    for (const d of this._disposers.splice(0)) d();
    this._endedCbs.length = 0;
    this._output.disconnect();
    this.audio.removeAttribute("src");
    this.audio.load();
    super.destroy();
  }
}
```

Then append to `packages/core/src/index.ts`:

```ts
export { StreamPlayer } from "./StreamPlayer";
export type { StreamPlayerOptions } from "./StreamPlayer";
```

- [ ] **Step 4: Run to verify it PASSES**

Run: `pnpm --filter @audiorective/core test -- --run tests/streamPlayer.test.ts`
Expected: PASS (9 tests). If the media element fails to load the data URI in headless chromium, confirm chromium is installed (`pnpm --filter @audiorective/core exec playwright install chromium`) and rerun. Fix implementation, not tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/StreamPlayer.ts packages/core/src/index.ts packages/core/tests/streamPlayer.test.ts
git commit -m "feat(core): add StreamPlayer (streaming track transport)"
```

---

## Task 3: Refactor MusicPlayer to wrap StreamPlayer

**Files:**

- Rewrite: `apps/showroom/src/shared/audio/MusicPlayer.ts`

The showroom app has no test runner (scripts: dev/build/preview/typecheck), so this task is verified by typecheck + build (Task 4) rather than a unit test. The public API is preserved so `PlayerPopup` and both demos need no changes.

- [ ] **Step 1: Replace `apps/showroom/src/shared/audio/MusicPlayer.ts` with EXACTLY:**

```ts
import { AudioProcessor, StreamPlayer } from "@audiorective/core";
import type { Cell } from "@audiorective/core";
import type { Track } from "./tracks";
import { EQ3 } from "./EQ3";

export interface TransportState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  currentTrackIndex: number;
}

type Cells = {
  transport: Cell<TransportState>;
  tracks: Cell<Track[]>;
};

/**
 * Demo music player: a core StreamPlayer (streaming transport) feeding a 3-band
 * EQ, with playlist management on top. Public API is unchanged from the original
 * HTMLAudio-based implementation, so the demos consume it identically.
 */
export class MusicPlayer extends AudioProcessor<Record<string, never>, Cells> {
  readonly stream: StreamPlayer;
  readonly eq: EQ3;

  constructor(ctx: AudioContext, initialTracks: Track[]) {
    const stream = new StreamPlayer(ctx);
    const eq = new EQ3(ctx);
    stream.output.connect(eq.input);

    super(ctx, ({ cell }) => ({
      cells: {
        transport: cell<TransportState>({
          isPlaying: false,
          currentTime: 0,
          duration: NaN,
          currentTrackIndex: 0,
        }),
        tracks: cell<Track[]>(initialTracks),
      },
    }));

    this.stream = stream;
    this.eq = eq;

    // Mirror the StreamPlayer's transport cells into the combined transport
    // state, preserving currentTrackIndex (owned by the playlist below).
    this.effect(() => {
      const isPlaying = stream.cells.isPlaying.$();
      const currentTime = stream.cells.currentTime.$();
      const duration = stream.cells.duration.$();
      this.cells.transport.update((d) => {
        d.isPlaying = isPlaying;
        d.currentTime = currentTime;
        d.duration = duration;
      });
    });

    stream.onEnded(() => this.next());

    if (initialTracks.length > 0) this.loadTrack(0);
  }

  get output(): AudioNode {
    return this.eq.output;
  }

  async play(): Promise<void> {
    await this.stream.play();
  }

  pause(): void {
    this.stream.pause();
  }

  seek(t: number): void {
    this.stream.seek(t);
  }

  loadTrack(i: number): void {
    const list = this.cells.tracks.value;
    if (list.length === 0) return;
    const idx = ((i % list.length) + list.length) % list.length;
    const track = list[idx]!;
    const wasPlaying = this.cells.transport.value.isPlaying;
    this.stream.src = track.src;
    this.cells.transport.update((d) => {
      d.currentTrackIndex = idx;
    });
    if (wasPlaying) void this.stream.play();
  }

  next(): void {
    this.loadTrack(this.cells.transport.value.currentTrackIndex + 1);
  }

  prev(): void {
    this.loadTrack(this.cells.transport.value.currentTrackIndex - 1);
  }

  override destroy(): void {
    super.destroy();
    this.stream.destroy();
    this.eq.destroy();
  }
}
```

- [ ] **Step 2: Typecheck the showroom**

Run: `pnpm --filter @audiorective/showroom run typecheck`
Expected: no output (success). This proves the wrapper compiles and nothing referenced the removed `audio` field. If anything referenced `player.audio`, update that call site to use `player.stream.audio` (only if a real reference exists — expected: none).

- [ ] **Step 3: Commit**

```bash
git add apps/showroom/src/shared/audio/MusicPlayer.ts
git commit -m "refactor(showroom): MusicPlayer wraps core StreamPlayer (+EQ +playlist)"
```

---

## Task 4: Exports check + full verification

**Files:**

- Modify (if needed): `packages/core/src/index.ts`
- Modify: `packages/core/tests/index.test.ts`

- [ ] **Step 1: Add an export assertion** — append to `packages/core/tests/index.test.ts` (ensure `describe`/`test`/`expect` are already imported from "vitest"; add any missing):

```ts
describe("StreamPlayer export", () => {
  test("exposes StreamPlayer (and SoundPlayer/Voice still present)", async () => {
    const mod = await import("../src");
    expect(typeof mod.StreamPlayer).toBe("function");
    expect(typeof mod.SoundPlayer).toBe("function");
    expect(typeof mod.Voice).toBe("function");
  });
});
```

- [ ] **Step 2: Run the export test**

Run: `pnpm --filter @audiorective/core test -- --run tests/index.test.ts`
Expected: PASS. If `StreamPlayer` is reported missing, confirm the export line from Task 2 is present in `packages/core/src/index.ts`, then rerun.

- [ ] **Step 3: Full core test + typecheck + build**

Run: `pnpm --filter @audiorective/core test -- --run`
Expected: PASS — all core tests (cell, engine, index, loadAudioBuffer, voice, soundPlayer [11], streamPlayer [9]). Report total.

Run: `pnpm --filter @audiorective/core run typecheck`
Expected: no output (success).

Run: `pnpm -r run build`
Expected: all packages build; `apps/showroom` builds (the MusicPlayer wrapper compiles).

- [ ] **Step 4: Lint new/changed files**

Run: `pnpm exec oxlint --type-aware packages/core/src/SoundPlayer.ts packages/core/src/StreamPlayer.ts packages/core/tests/soundPlayer.test.ts packages/core/tests/streamPlayer.test.ts apps/showroom/src/shared/audio/MusicPlayer.ts`
Expected: "Found 0 warnings and 0 errors."

- [ ] **Step 5: Commit**

```bash
git add packages/core/tests/index.test.ts packages/core/src/index.ts
git commit -m "test(core): assert StreamPlayer export"
```

---

## Verification (end to end)

- `pnpm --filter @audiorective/core test -- --run` — all core tests green.
- `pnpm -r run typecheck` — clean (incl. showroom).
- `pnpm -r run build` — workspace + showroom build.
- Manual (ask the user to start the dev server — do not start it yourself): open both spatial rooms; the CD player still plays music (now via `StreamPlayer` under the `MusicPlayer` wrapper); play/pause/seek/next/prev and the EQ sliders behave as before; track auto-advances at end.

## Notes for the implementer

- **`SoundPlayer` slim is a public-API removal** but nothing consumes `SoundPlayer` yet (it's new on this branch), so there are no downstream call sites to update.
- **`StreamPlayer` event ordering:** handlers are registered after `super()` (so `this.cells` exists) and `this.src = opts.src` runs last in the constructor, after `_src`/handlers are set up.
- **`MediaElementAudioSourceNode` is one-per-element and can't be recreated** — `StreamPlayer` owns one element for its lifetime; `src` changes reuse it.
- **Browser test timing:** `StreamPlayer` tests await real media events (`loadedmetadata`, `ended`) with timeouts; core runs serially so this is stable. Keep the data-URI WAV approach — it needs no external asset.
- **Do not change test assertions to pass** — fix the implementation.

```

```
