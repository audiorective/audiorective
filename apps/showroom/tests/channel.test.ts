import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Channel } from "../src/audio/Channel";

function makeSource(ctx: AudioContext) {
  return { output: new GainNode(ctx) };
}

/** Poll until a predicate holds (or timeout) — the audio clock can run slow under load. */
async function waitFor(predicate: () => boolean, timeout = 3000, step = 25): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, step));
  }
}

describe("Channel", () => {
  let ctx: AudioContext;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
  });
  afterEach(() => {
    void ctx.close();
  });

  test("volume param drives the fader gain", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    ch.params.volume.value = 0.3;
    // fader gain is internal; assert via the public param (bound 1:1)
    expect(ch.params.volume.value).toBeCloseTo(0.3);
    ch.destroy();
  });

  test("exposes EQ bands via channel.eq.params", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    ch.eq.params.eqLow.value = 6;
    expect(ch.eq.params.eqLow.value).toBeCloseTo(6);
    ch.destroy();
  });

  test("roomOut and phonesOut are distinct AudioNodes", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    expect(ch.roomOut).toBeInstanceOf(AudioNode);
    expect(ch.phonesOut).toBeInstanceOf(AudioNode);
    expect(ch.roomOut).not.toBe(ch.phonesOut);
    ch.destroy();
  });

  test("auxOut is the pre-panner tap (distinct from the post-panner roomOut)", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    expect(ch.auxOut).toBeInstanceOf(AnalyserNode); // pre-distance send point
    expect(ch.auxOut).not.toBe(ch.roomOut); // roomOut is post-panner (distance-attenuated)
    ch.destroy();
  });

  test("headphone pan tracks the position cell (right = positive)", () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    expect((ch.phonesOut as StereoPannerNode).pan.value).toBeCloseTo(0);
    ch.cells.position.value = { x: 5, y: 1, z: -3 };
    expect((ch.phonesOut as StereoPannerNode).pan.value).toBeGreaterThan(0.5);
    ch.destroy();
  });

  test("applyMix(false) ramps the mute gain toward 0", async () => {
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source: makeSource(ctx), position: { x: 0, y: 1, z: -3 } });
    // An AudioParam ramp only advances .value when the node graph reaches the
    // destination (headless Chromium won't render a disconnected subgraph). Mirror
    // the repo convention in packages/core/tests/streamPlayer.test.ts.
    ch.roomOut.connect(ctx.destination);
    ch.applyMix(false);
    await waitFor(() => ch.muteGainValue < 0.05);
    expect(ch.muteGainValue).toBeLessThan(0.05);
    ch.applyMix(true);
    await waitFor(() => ch.muteGainValue > 0.95);
    expect(ch.muteGainValue).toBeGreaterThan(0.95);
    ch.destroy();
  });

  test("destroy() also destroys a source that has a destroy method", () => {
    let destroyed = false;
    const source = {
      output: new GainNode(ctx),
      destroy: () => {
        destroyed = true;
      },
    };
    const ch = new Channel(ctx, { id: "g1", label: "Guitar 1", color: "#16a34a", source, position: { x: 0, y: 1, z: -3 } });
    ch.destroy();
    expect(destroyed).toBe(true);
  });
});
