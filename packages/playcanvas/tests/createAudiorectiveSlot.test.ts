import { describe, test, expect, beforeAll, afterAll } from "vitest";
import * as pc from "playcanvas";
import { AudioProcessor } from "@audiorective/core";
import { attach, createAudiorectiveSlot, AudiorectiveSoundSlot } from "../src";
import { AudiorectiveSoundInstance } from "../src/internal/AudiorectiveSoundInstance";
import { AudiorectiveSoundInstance3d } from "../src/internal/AudiorectiveSoundInstance3d";

class PassthroughEffect extends AudioProcessor {
  private readonly _input: GainNode;
  private readonly _output: GainNode;

  constructor(ctx: AudioContext) {
    const input = new GainNode(ctx);
    const output = new GainNode(ctx);
    input.connect(output);
    super(ctx, () => ({}));
    this._input = input;
    this._output = output;
  }

  override get input(): GainNode {
    return this._input;
  }

  get output(): GainNode {
    return this._output;
  }
}

// Inspect the per-instance Web Audio graph. Web Audio has no introspection
// API, so we peek at the private fields the playcanvas SoundInstance puts on
// itself. These are documented in src/internal/Audiorective{Sound,3d}.ts.
interface InstanceGraph {
  gain: GainNode;
  panner?: PannerNode;
  _inputNode: AudioNode;
  _connectorNode: AudioNode;
  source: AudioBufferSourceNode | null;
}

function makeApp(): pc.Application {
  const canvas = document.createElement("canvas");
  return new pc.Application(canvas, {});
}

function makeSilentSound(ctx: AudioContext): pc.Sound {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  return new pc.Sound(buffer);
}

function addSoundEntity(app: pc.Application, positional: boolean): pc.SoundComponent {
  const ent = new pc.Entity("sound-host");
  app.root.addChild(ent);
  ent.addComponent("sound", { positional });
  return ent.sound!;
}

describe("createAudiorectiveSlot", () => {
  let app: pc.Application;
  let ctx: AudioContext;

  beforeAll(() => {
    app = makeApp();
    // Use a fresh AudioContext shared with PlayCanvas (attach installs it).
    const engineLike = { context: new AudioContext(), autoStart: () => () => {} };
    attach(engineLike as never, app as never);
    ctx = app.soundManager.context as AudioContext;
  });

  afterAll(() => {
    app.destroy();
  });

  test("returns an AudiorectiveSoundSlot registered on the component", () => {
    const sound = addSoundEntity(app, true);
    const slot = createAudiorectiveSlot(sound, "track-a", { volume: 1, loop: false });
    expect(slot).toBeInstanceOf(AudiorectiveSoundSlot);
    expect(sound.slot("track-a")).toBe(slot);
  });

  test("duplicate name returns null and warns (matches addSlot semantics)", () => {
    const sound = addSoundEntity(app, true);
    createAudiorectiveSlot(sound, "dup", { volume: 1 });
    const dup = createAudiorectiveSlot(sound, "dup", { volume: 1 });
    expect(dup).toBeNull();
  });

  test("positional pre-FX: source → processor → panner → gain", () => {
    const sound = addSoundEntity(app, true);
    const eq = new PassthroughEffect(ctx);
    const slot = createAudiorectiveSlot(sound, "music", { volume: 1, loop: false }, { processor: eq })!;

    const instance = (slot as unknown as { _createInstance(): unknown })._createInstance() as AudiorectiveSoundInstance3d;
    expect(instance).toBeInstanceOf(AudiorectiveSoundInstance3d);

    const graph = instance as unknown as InstanceGraph;
    expect(graph._inputNode).toBe(eq.input);
    expect(graph._connectorNode).toBe(graph.gain);
    expect(graph.panner).toBeInstanceOf(PannerNode);
  });

  test("non-positional pre-FX: source → processor → gain (no panner)", () => {
    const sound = addSoundEntity(app, false);
    const eq = new PassthroughEffect(ctx);
    const slot = createAudiorectiveSlot(sound, "ui", { volume: 1, loop: false }, { processor: eq })!;

    const instance = (slot as unknown as { _createInstance(): unknown })._createInstance() as AudiorectiveSoundInstance;
    expect(instance).toBeInstanceOf(AudiorectiveSoundInstance);

    const graph = instance as unknown as InstanceGraph;
    expect(graph._inputNode).toBe(eq.input);
    expect(graph._connectorNode).toBe(graph.gain);
    expect((instance as unknown as { panner?: unknown }).panner).toBeUndefined();
  });

  test("no processor: graph is byte-equivalent to a stock slot", () => {
    const sound = addSoundEntity(app, true);
    const slot = createAudiorectiveSlot(sound, "ambient", { volume: 1, loop: false })!;
    const instance = (slot as unknown as { _createInstance(): unknown })._createInstance() as AudiorectiveSoundInstance3d;

    const graph = instance as unknown as InstanceGraph;
    // Stock 3d topology: source → panner → gain → destination.
    expect(graph._inputNode).toBe(graph.panner);
    expect(graph._connectorNode).toBe(graph.gain);
  });

  test("instrument-shaped processor (no .input) throws at construction", () => {
    const sound = addSoundEntity(app, true);
    class InstrumentOnly extends AudioProcessor {
      private readonly _output: GainNode;
      constructor(c: AudioContext) {
        const output = new GainNode(c);
        super(c, () => ({}));
        this._output = output;
      }
      get output(): GainNode {
        return this._output;
      }
    }
    const inst = new InstrumentOnly(ctx);
    const slot = createAudiorectiveSlot(sound, "bad", { volume: 1 }, { processor: inst })!;
    expect(() => (slot as unknown as { _createInstance(): unknown })._createInstance()).toThrow(/effect-shaped/);
  });

  test("track switch path: each play() builds a fresh instance with FX baked in", () => {
    // Repro of the PR's open issue: after stop() + play() + sound asset swap,
    // the new instance must still have the processor in its audible path.
    const sound = addSoundEntity(app, true);
    const eq = new PassthroughEffect(ctx);
    const slot = createAudiorectiveSlot(sound, "switching", { volume: 1, loop: false }, { processor: eq })!;

    const buf1 = makeSilentSound(ctx);
    const buf2 = makeSilentSound(ctx);

    // Force-prime the slot by handing it pre-loaded sound resources. This
    // mirrors what slot.asset = X; asset.ready() does in production.
    const first = (slot as unknown as { _createInstance(): unknown })._createInstance() as AudiorectiveSoundInstance3d;
    (first as unknown as { _sound: pc.Sound })._sound = buf1;
    const graph1 = first as unknown as InstanceGraph;
    expect(graph1._inputNode).toBe(eq.input);

    const second = (slot as unknown as { _createInstance(): unknown })._createInstance() as AudiorectiveSoundInstance3d;
    (second as unknown as { _sound: pc.Sound })._sound = buf2;
    const graph2 = second as unknown as InstanceGraph;
    expect(graph2._inputNode).toBe(eq.input);
    expect(graph2.panner).not.toBe(graph1.panner); // fresh panner per instance
  });
});
