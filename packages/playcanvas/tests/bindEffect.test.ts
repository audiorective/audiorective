import { describe, test, expect, vi } from "vitest";
import { EventHandler } from "playcanvas";
import { AudioProcessor } from "@audiorective/core";
import type { SoundSlot } from "playcanvas";
import { bindEffect } from "../src";

const ctx = new AudioContext();

class TestEffect extends AudioProcessor {
  private readonly _entry = new GainNode(ctx);
  private readonly _exit = new GainNode(ctx);
  constructor() {
    super(ctx, () => ({}));
    this._entry.connect(this._exit);
  }
  override get input(): GainNode {
    return this._entry;
  }
  get output(): GainNode {
    return this._exit;
  }
}

class TestInstrument extends AudioProcessor {
  private readonly _out = new GainNode(ctx);
  constructor() {
    super(ctx, () => ({}));
  }
  get output(): GainNode {
    return this._out;
  }
}

class FakeInstance extends EventHandler {
  source: AudioBufferSourceNode;
  panner: PannerNode;
  constructor() {
    super();
    this.source = ctx.createBufferSource();
    this.source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    this.panner = ctx.createPanner();
    this.source.connect(this.panner);
  }
}

class FakeSlot extends EventHandler {
  instances: FakeInstance[] = [];
  setExternalNodes = vi.fn<(first: AudioNode, last?: AudioNode) => void>();
  clearExternalNodes = vi.fn<() => void>();
  startInstance(): FakeInstance {
    const instance = new FakeInstance();
    this.instances.push(instance);
    this.fire("play", instance);
    return instance;
  }
}

function isConnectedTo(from: AudioNode, to: AudioNode): boolean {
  // No public introspection of Web Audio graph — rely on disconnect throwing
  // InvalidAccessError if no connection exists. We "probe" by attempting a
  // disconnect-and-reconnect cycle wrapped in try/catch.
  try {
    from.disconnect(to);
    from.connect(to);
    return true;
  } catch {
    return false;
  }
}

describe("bindEffect", () => {
  test("throws when the processor has no .input (instrument-shaped)", () => {
    const slot = new FakeSlot();
    const inst = new TestInstrument();
    expect(() => bindEffect(slot as unknown as SoundSlot, inst)).toThrow(/effect-shaped/);
    inst.destroy();
  });

  describe("position: 'post'", () => {
    test("calls slot.setExternalNodes with processor input/output", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx, { position: "post" });
      expect(slot.setExternalNodes).toHaveBeenCalledWith(fx.input, fx.output);
      dispose();
      fx.destroy();
    });

    test("disposer calls slot.clearExternalNodes", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx, { position: "post" });
      dispose();
      expect(slot.clearExternalNodes).toHaveBeenCalled();
      fx.destroy();
    });

    test("disposer is idempotent", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx, { position: "post" });
      dispose();
      dispose();
      expect(slot.clearExternalNodes).toHaveBeenCalledTimes(1);
      fx.destroy();
    });
  });

  describe("position: 'pre' (default)", () => {
    test("splices into instances created after binding", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx);

      const inst = slot.startInstance();
      expect(isConnectedTo(inst.source, fx.input)).toBe(true);
      expect(isConnectedTo(fx.output, inst.panner)).toBe(true);

      dispose();
      fx.destroy();
    });

    test("splices into already-playing instances at bind time", () => {
      const slot = new FakeSlot();
      const inst = new FakeInstance();
      slot.instances.push(inst);

      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx);

      expect(isConnectedTo(inst.source, fx.input)).toBe(true);
      expect(isConnectedTo(fx.output, inst.panner)).toBe(true);

      dispose();
      fx.destroy();
    });

    test("cleans up the processor → panner edge on instance 'end'", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx);

      const inst = slot.startInstance();
      expect(isConnectedTo(fx.output, inst.panner)).toBe(true);
      inst.fire("end");
      expect(isConnectedTo(fx.output, inst.panner)).toBe(false);

      dispose();
      fx.destroy();
    });

    test("cleans up on 'stop' as well", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx);

      const inst = slot.startInstance();
      expect(isConnectedTo(fx.output, inst.panner)).toBe(true);
      inst.fire("stop");
      expect(isConnectedTo(fx.output, inst.panner)).toBe(false);

      dispose();
      fx.destroy();
    });

    test("disposer stops splicing future instances", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx);
      dispose();

      const inst = slot.startInstance();
      // No splice happened — original source → panner edge remains, processor was not inserted.
      expect(isConnectedTo(inst.source, fx.input)).toBe(false);

      fx.destroy();
    });

    test("never calls setExternalNodes (pre-panner is independent of post-panner API)", () => {
      const slot = new FakeSlot();
      const fx = new TestEffect();
      const dispose = bindEffect(slot as unknown as SoundSlot, fx);
      slot.startInstance();
      expect(slot.setExternalNodes).not.toHaveBeenCalled();
      dispose();
      fx.destroy();
    });
  });
});
