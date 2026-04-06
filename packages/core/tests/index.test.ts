import { describe, test, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { effect } from "alien-signals";
import { Param, SchedulableParam, ParamSync, AudioProcessor } from "../src";

const ctx = new AudioContext();
let gain: GainNode;
beforeAll(async () => {
  await ctx.resume();
});
beforeEach(() => {
  gain = new GainNode(ctx);
  gain.connect(ctx.destination);
});
afterEach(() => {
  gain.disconnect();
});

function waitUntil(time: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (ctx.currentTime > time) {
        resolve();
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
function wait(seconds: number): Promise<void> {
  return waitUntil(ctx.currentTime + seconds);
}

describe("Param", () => {
  test(".value read/write", () => {
    const p = new Param({ default: 42 });
    expect(p.value).toBe(42);
    p.value = 100;
    expect(p.value).toBe(100);
  });

  test(".$ exposes raw signal for reactivity", () => {
    const p = new Param({ default: "hello" });
    const values: string[] = [];
    effect(() => {
      values.push(p.$());
    });
    expect(values).toEqual(["hello"]);
    p.value = "world";
    expect(values).toEqual(["hello", "world"]);
  });

  test("works with object types", () => {
    const p = new Param({ default: { x: 1, y: 2 } });
    expect(p.value).toEqual({ x: 1, y: 2 });
    const values: Array<{ x: number; y: number }> = [];
    effect(() => {
      values.push(p.$());
    });
    p.value = { x: 10, y: 20 };
    expect(p.value).toEqual({ x: 10, y: 20 });
    expect(values).toEqual([
      { x: 1, y: 2 },
      { x: 10, y: 20 },
    ]);
  });

  test("works with array types", () => {
    const p = new Param({ default: [1, 2, 3] });
    expect(p.value).toEqual([1, 2, 3]);
    p.value = [4, 5];
    expect(p.value).toEqual([4, 5]);
  });

  test("bind.set is called on value change", () => {
    let external = "initial";
    const p = new Param({
      default: "hello",
      bind: {
        set: (v) => {
          external = v;
        },
      },
    });
    expect(external).toBe("hello");
    p.value = "world";
    expect(external).toBe("world");
    p.destroy();
  });

  test("bind.set effect stops on destroy", () => {
    let callCount = 0;
    const p = new Param({
      default: 0,
      bind: {
        set: () => {
          callCount++;
        },
      },
    });
    expect(callCount).toBe(1);
    p.value = 1;
    expect(callCount).toBe(2);
    p.destroy();
    p.value = 2;
    expect(callCount).toBe(2);
  });

  test("destroy is safe no-op without bind", () => {
    const p = new Param({ default: 42 });
    p.destroy();
    p.value = 100;
    expect(p.value).toBe(100);
  });
});

describe("SchedulableParam", () => {
  test("respect default value", () => {
    const p = new SchedulableParam({
      default: 10,
      audioContext: ctx,
      audioParam: gain.gain,
    });
    expect(p.value).toEqual(10);
    expect(p.read()).toEqual(10);
  });
  test("setter propagates to underlying AudioParam", () => {
    const p = new SchedulableParam({
      default: 0,
      audioContext: ctx,
      audioParam: gain.gain,
    });
    p.value = 0.8;

    expect(gain.gain.value).toBeCloseTo(0.8, 5);
    p.destroy();
  });

  test("methods are chainable", () => {
    const startTime = ctx.currentTime;
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    const result = p.setValueAtTime(1, startTime).linearRampToValueAtTime(2, startTime + 1);
    expect(result).toBe(p);
    p.destroy();
  });

  test("setValueAtTime defers value until scheduled time", async () => {
    const startTime = ctx.currentTime;
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    p.setValueAtTime(50, startTime + 0.05);

    expect(p.value).toBe(0);

    await waitUntil(startTime + 0.06);
    expect(p.read()).toBe(50);
    p.destroy();
  });

  test("cancelScheduledValues removes future events", async () => {
    const startTime = ctx.currentTime;
    const p = new SchedulableParam({ default: 0, audioParam: gain.gain, audioContext: ctx });
    p.setValueAtTime(1, startTime + 0.001);
    p.setValueAtTime(-1, startTime + 99999);
    p.cancelScheduledValues(startTime + 1);

    await wait(0.01);

    expect(p.value).toBe(1);
    p.destroy();
  });

  test("linearRampToValueAtTime reaches target", async () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    const startTime = ctx.currentTime;
    p.linearRampToValueAtTime(100, startTime + 0.05);

    await wait(startTime + 0.06);
    expect(p.value).toBeCloseTo(100, 0);
    p.destroy();
  });

  test("exponentialRampToValueAtTime reaches target", async () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    const startTime = ctx.currentTime;
    p.setValueAtTime(1, startTime);
    p.exponentialRampToValueAtTime(100, startTime + 0.05);

    await wait(startTime + 0.06);
    expect(p.value).toBeCloseTo(100, 0);
    p.destroy();
  });

  test("cancelAndHoldAtTime freezes value at cancel point", async () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    const startTime = ctx.currentTime;
    p.linearRampToValueAtTime(1, startTime + 1);
    p.cancelAndHoldAtTime(0.01);
    await waitUntil(startTime + 0.01);
    const frozen = p.read();
    await wait(0.01);
    expect(p.value).toBeCloseTo(frozen, 0);
    p.destroy();
  });

  test("setTargetAtTime approaches target asymptotically", async () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    const startTime = ctx.currentTime;
    p.setValueAtTime(0, startTime);
    p.setTargetAtTime(1, startTime, 0.01);

    // after ~5 time constants the value should be very close to target
    await waitUntil(startTime + 0.06);
    expect(p.read()).toBeCloseTo(1, 1);
    p.destroy();
  });

  test("read() returns live AudioParam value during automation", async () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    const startTime = ctx.currentTime;
    p.setValueAtTime(0, startTime);
    p.linearRampToValueAtTime(1, startTime + 0.1);

    // mid-ramp, read() should return an intermediate value from the AudioParam
    await waitUntil(startTime + 0.05);
    const midValue = p.read();
    expect(midValue).toBeGreaterThan(0);
    expect(midValue).toBeLessThan(1);
    p.destroy();
  });

  test("syncFromAudio() writes AudioParam value to signal without triggering AudioParam setter", () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    // directly mutate the AudioParam, bypassing SchedulableParam
    gain.gain.value = 0.6;
    // signal still has old value
    expect(p.value).toBe(0);
    // sync pulls AudioParam value into the signal
    p.syncFromAudio();
    expect(p.value).toBeCloseTo(0.6, 5);
    p.destroy();
  });

  test("destroy() unregisters from ParamSync", () => {
    const sync = ParamSync.for(ctx);
    const sizeBefore = sync.size;
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain });
    expect(sync.size).toBe(sizeBefore + 1);
    p.destroy();
    expect(sync.size).toBe(sizeBefore);
  });
});

describe("ParamSync", () => {
  test("auto-starts when first param registers, auto-stops on unregister", async () => {
    const newCtx = new AudioContext();
    const sync = ParamSync.for(newCtx);

    expect(sync.running).toBe(false);
    expect(sync.size).toBe(0);

    const p = new SchedulableParam({ default: 0, audioContext: newCtx, audioParam: gain.gain });

    expect(sync.size).toBe(1);
    expect(sync.running).toBe(true);

    p.destroy();

    expect(sync.size).toBe(0);
    expect(sync.running).toBe(false);
    await newCtx.suspend();
  });

  test("returns same instance for same AudioContext", () => {
    const a = ParamSync.for(ctx);
    const b = ParamSync.for(ctx);
    expect(a).toBe(b);
  });

  test("syncs registered params", async () => {
    const p = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain, syncInterval: 0.01 });
    const gain2 = ctx.createGain();
    gain2.connect(ctx.destination);
    const p2 = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain2.gain, syncInterval: 0.01 });

    gain.gain.value = 0.3;
    gain2.gain.value = 0.4;

    // wait for sync loop to fire
    await wait(0.1);

    expect(p.value).toBeCloseTo(0.3, 5);
    expect(p2.value).toBeCloseTo(0.4, 5);

    p.destroy();
    p2.destroy();
    gain2.disconnect();
  });

  test("respects custom syncInterval per param", async () => {
    const gain2 = ctx.createGain();
    gain2.connect(ctx.destination);

    // fast sync (10ms) vs slow sync (2000ms)
    const fast = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain.gain, syncInterval: 10 });
    const slow = new SchedulableParam({ default: 0, audioContext: ctx, audioParam: gain2.gain, syncInterval: 2000 });

    gain.gain.value = 0.5;
    gain2.gain.value = 0.5;

    // after 50ms, fast param should have synced but slow should not
    await wait(0.05);
    expect(fast.value).toBeCloseTo(0.5, 5);
    expect(slow.value).toBe(0);

    fast.destroy();
    slow.destroy();
    gain2.disconnect();
  });

  test("multiple params share one ParamSync, lifecycle tracks correctly", () => {
    const newCtx = new AudioContext();
    const sync = ParamSync.for(newCtx);

    const p1 = new SchedulableParam({ default: 0, audioContext: newCtx, audioParam: gain.gain });
    const p2 = new SchedulableParam({ default: 0, audioContext: newCtx, audioParam: gain.gain });
    const p3 = new SchedulableParam({ default: 0, audioContext: newCtx, audioParam: gain.gain });

    expect(sync.size).toBe(3);
    expect(sync.running).toBe(true);

    p1.destroy();
    expect(sync.size).toBe(2);
    expect(sync.running).toBe(true);

    p2.destroy();
    p3.destroy();
    expect(sync.size).toBe(0);
    expect(sync.running).toBe(false);
  });
});

describe("AudioProcessor", () => {
  class TestProcessor extends AudioProcessor {
    readonly vol = this.param({ default: 0.5 });
    readonly name = this.param({ default: "test" });

    constructor() {
      super(ctx);
    }

    get output(): AudioNode {
      return ctx.destination;
    }
  }

  test("auto-detects param names via getState", () => {
    const p = new TestProcessor();
    const state = p.getState();
    expect(state.version).toBe(1);
    expect(state.parameters).toEqual({ vol: 0.5, name: "test" });
  });

  test("setState restores param values", () => {
    const p = new TestProcessor();
    p.setState({ version: 1, parameters: { vol: 0.8, name: "updated" } });
    expect(p.vol.value).toBe(0.8);
    expect(p.name.value).toBe("updated");
  });

  test("getParameter returns param by name", () => {
    const p = new TestProcessor();
    const vol = p.getParameter("vol");
    expect(vol).toBe(p.vol);
    expect(p.getParameter("nonexistent")).toBeUndefined();
  });

  test("effect cleanup on destroy", () => {
    const p = new TestProcessor();
    let runCount = 0;
    p["effect"](() => {
      p.vol.$();
      runCount++;
    });
    expect(runCount).toBe(1);
    p.vol.value = 0.9;
    expect(runCount).toBe(2);
    p.destroy();
    p.vol.value = 0.1;
    expect(runCount).toBe(2);
  });

  test("bind function resolves to SchedulableParam", () => {
    class BindProcessor extends AudioProcessor {
      readonly _gain = gain;
      readonly vol = this.param({
        default: 0.5,
        bind: gain.gain,
      });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode {
        return this._gain;
      }
    }

    const p = new BindProcessor();
    expect(p.vol).toBeInstanceOf(SchedulableParam);
    p.vol.value = 0.7;
    expect(gain.gain.value).toBeCloseTo(0.7, 5);
    p.destroy();
  });

  test("bind function supports scheduling", async () => {
    class AudioParamProcessor extends AudioProcessor {
      readonly vol = this.param({
        default: 0.5,
        bind: gain.gain,
      });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode {
        return gain;
      }
    }

    const p = new AudioParamProcessor();
    expect(p.vol).toBeInstanceOf(SchedulableParam);
    const startTime = ctx.currentTime;
    p.vol.setValueAtTime(0.3, startTime + 0.01);
    await waitUntil(startTime + 0.02);
    expect(p.vol.read()).toBeCloseTo(0.3, 5);
    p.destroy();
  });

  test("bind object creates Param with reactive sync", () => {
    let external = "";
    class BindObjProcessor extends AudioProcessor {
      readonly waveform = this.param<string>({
        default: "sine",
        bind: {
          set: (v) => {
            external = v;
          },
        },
      });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode | undefined {
        return undefined;
      }
    }

    const p = new BindObjProcessor();
    expect(p.waveform).toBeInstanceOf(Param);
    expect(p.waveform).not.toBeInstanceOf(SchedulableParam);
    expect(external).toBe("sine");
    p.waveform.value = "sawtooth";
    expect(external).toBe("sawtooth");
    p.destroy();
    p.waveform.value = "square";
    expect(external).toBe("sawtooth");
  });

  test("param({ schedulable: true }) creates SchedulableParam via ConstantSourceNode", () => {
    class CSNProcessor extends AudioProcessor {
      readonly intensity = this.param({ default: 440, schedulable: true as const });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode | undefined {
        return undefined;
      }
    }

    const p = new CSNProcessor();
    expect(p.intensity).toBeInstanceOf(SchedulableParam);
    p.intensity.value = 880;
    expect(p.intensity.value).toBe(880);
    p.destroy();
  });

  test("param({ schedulable: true }) scheduling evaluates on ConstantSourceNode", async () => {
    class CSNProcessor extends AudioProcessor {
      readonly intensity = this.param({ default: 0, schedulable: true as const });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode | undefined {
        return undefined;
      }
    }

    const p = new CSNProcessor();
    const startTime = ctx.currentTime;
    p.intensity.setValueAtTime(880, startTime + 0.05);

    expect(p.intensity.read()).toBeCloseTo(0, 0);

    await waitUntil(startTime + 0.06);
    expect(p.intensity.read()).toBeCloseTo(880, 0);
    p.destroy();
  });

  test("computed() derives from params reactively", () => {
    class ComputedProcessor extends AudioProcessor {
      readonly bpm = this.param({ default: 120 });
      readonly beatDuration = this["computed"](() => 60000 / this.bpm.value);

      constructor() {
        super(ctx);
      }

      get output(): AudioNode | undefined {
        return undefined;
      }
    }

    const p = new ComputedProcessor();
    expect(p.beatDuration()).toBe(500);
    p.bpm.value = 240;
    expect(p.beatDuration()).toBe(250);
    p.destroy();
  });

  test("destroy() cleans up effects, SchedulableParams, and ConstantSources", () => {
    class FullProcessor extends AudioProcessor {
      readonly vol = this.param({ default: 0.5, schedulable: true as const });
      readonly name = this.param({ default: "test" });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode | undefined {
        return undefined;
      }
    }

    const sync = ParamSync.for(ctx);
    const sizeBefore = sync.size;

    const p = new FullProcessor();
    expect(sync.size).toBe(sizeBefore + 1);

    let effectRuns = 0;
    p["effect"](() => {
      p.vol.$();
      effectRuns++;
    });
    expect(effectRuns).toBe(1);

    p.destroy();

    expect(sync.size).toBe(sizeBefore);
    p.vol.value = 999;
    expect(effectRuns).toBe(1);
  });

  test("destroy() cleans up bind effects on all params", () => {
    let external = "";
    class BindCleanupProcessor extends AudioProcessor {
      readonly waveform = this.param<string>({
        default: "sine",
        bind: {
          set: (v) => {
            external = v;
          },
        },
      });

      constructor() {
        super(ctx);
      }

      get output(): AudioNode | undefined {
        return undefined;
      }
    }

    const p = new BindCleanupProcessor();
    expect(external).toBe("sine");
    p.waveform.value = "sawtooth";
    expect(external).toBe("sawtooth");
    p.destroy();
    p.waveform.value = "triangle";
    expect(external).toBe("sawtooth");
  });

  test("setState ignores unknown keys gracefully", () => {
    const p = new TestProcessor();
    p.setState({ version: 1, parameters: { vol: 0.8, name: "updated", nonexistent: 42 } });
    expect(p.vol.value).toBe(0.8);
    expect(p.name.value).toBe("updated");
  });
});
