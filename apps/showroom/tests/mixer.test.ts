import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { Channel } from "../src/audio/Channel";
import { Mixer } from "../src/audio/Mixer";

function makeChannel(ctx: AudioContext, id: string, x = 0) {
  return new Channel(ctx, { id, label: id, color: "#fff", source: { output: new GainNode(ctx) }, position: { x, y: 1, z: -3 } });
}
const settle = () => new Promise((r) => setTimeout(r, 60));

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

  test("defaults to the room path (room audible, phones silent)", () => {
    expect(mixer.roomBusGain).toBeCloseTo(1);
    expect(mixer.phonesBusGain).toBeCloseTo(0);
  });

  test("headphone toggle swaps the buses (room + aux off, phones on)", async () => {
    mixer.params.headphone.value = true;
    await settle();
    expect(mixer.roomBusGain).toBeLessThan(0.05);
    expect(mixer.auxBusGain).toBeLessThan(0.05); // reverb is part of "the room" — muted on headphone
    expect(mixer.phonesBusGain).toBeGreaterThan(0.95);
  });

  test("defaults route the aux (reverb send) bus on", () => {
    expect(mixer.auxBusGain).toBeCloseTo(1);
  });

  test("muting a channel silences only it (no solo active)", async () => {
    channels[0].params.muted.value = true;
    await settle();
    expect(channels[0].muteGainValue).toBeLessThan(0.05);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("soloing a channel silences the others", async () => {
    channels[1].params.soloed.value = true;
    await settle();
    expect(channels[0].muteGainValue).toBeLessThan(0.05);
    expect(channels[1].muteGainValue).toBeGreaterThan(0.95);
  });

  test("solo overrides mute for the soloed channel", async () => {
    channels[1].params.soloed.value = true;
    channels[1].params.muted.value = true;
    await settle();
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
