import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Channel } from "../src/audio/Channel";
import { Mixer } from "../src/audio/Mixer";

function makeChannel(ctx: AudioContext, id: string, x = 0) {
  return new Channel(ctx, { id, label: id, color: "#fff", source: { output: new GainNode(ctx) }, position: { x, y: 1, z: -3 } });
}

/**
 * Poll until a predicate holds (or timeout). Bus/mute changes are short AudioParam
 * ramps; under CPU load the headless WebAudio clock advances much slower than
 * wall-clock, so a fixed sleep is flaky. Polling waits for the ramp to actually
 * resolve regardless of how starved the audio thread is.
 */
async function waitFor(predicate: () => boolean, timeout = 3000, step = 25): Promise<void> {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, step));
  }
}

describe("Mixer", () => {
  let ctx: AudioContext;
  let channels: Channel[];
  let mixer: Mixer;
  beforeEach(async () => {
    ctx = new AudioContext();
    await ctx.resume();
    channels = [makeChannel(ctx, "a", -2), makeChannel(ctx, "b", 2)];
    mixer = new Mixer(ctx, channels);
  });
  afterEach(() => {
    mixer.destroy();
    void ctx.close();
  });

  test("defaults to the room path (room audible at +5 dB, phones silent)", () => {
    expect(mixer.roomBusGain).toBeGreaterThan(1.5); // +5 dB ≈ 1.78
    expect(mixer.phonesBusGain).toBeCloseTo(0);
  });

  test("defaults route the aux (reverb send) bus on", () => {
    expect(mixer.auxBusGain).toBeCloseTo(1);
  });

  test("headphone toggle: room + aux off, phones on at -9.5 dB", async () => {
    mixer.params.headphone.value = true;
    await waitFor(() => mixer.roomBusGain < 0.05 && mixer.auxBusGain < 0.05 && mixer.phonesBusGain > 0.25);
    expect(mixer.roomBusGain).toBeLessThan(0.05);
    expect(mixer.auxBusGain).toBeLessThan(0.05); // reverb is part of "the room" — muted on headphone
    expect(mixer.phonesBusGain).toBeGreaterThan(0.25); // -9.5 dB ≈ 0.33
    expect(mixer.phonesBusGain).toBeLessThan(0.45);
  });

  test("muting a channel silences only it (no solo active)", async () => {
    channels[0].params.muted.value = true;
    await waitFor(() => channels[0].muteGainValue < 0.05 && channels[1].muteGainValue > 0.95);
    expect(channels[0].muteGainValue).toBeLessThan(0.05);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("soloing a channel silences the others", async () => {
    channels[1].params.soloed.value = true;
    await waitFor(() => channels[0].muteGainValue < 0.05 && channels[1].muteGainValue > 0.95);
    expect(channels[0].muteGainValue).toBeLessThan(0.05);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("solo overrides mute for the soloed channel", async () => {
    channels[1].params.soloed.value = true;
    channels[1].params.muted.value = true;
    await waitFor(() => channels[1].muteGainValue > 0.95);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("metering can start and stop without throwing", () => {
    mixer.startMetering();
    mixer.startMetering(); // idempotent
    mixer.stopMetering();
  });

  test("master output is an AudioNode", () => {
    expect(mixer.output).toBeInstanceOf(AudioNode);
  });
});
