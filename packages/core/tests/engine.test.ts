import { describe, test, expect, vi } from "vitest";
import { AudioProcessor, AudioEngine, createEngine, type Param } from "../src";

class TestProcessor extends AudioProcessor<{ vol: Param<number> }> {
  constructor(ctx: AudioContext) {
    super(ctx, ({ param }) => ({
      params: { vol: param<number>({ default: 0.5 }) },
    }));
  }

  get output(): AudioNode | undefined {
    return undefined;
  }
}

class TestEngine extends AudioEngine {
  constructor(ctx?: AudioContext) {
    super(ctx);
    this.register(new TestProcessor(this.context));
  }

  getProcessor(): TestProcessor {
    return (this as any)._processors[0] as TestProcessor;
  }
}

describe("AudioEngine", () => {
  test("constructor creates AudioContext and registers processors", () => {
    const engine = new TestEngine();
    expect(engine.context).toBeInstanceOf(AudioContext);
    expect(engine.getProcessor()).toBeInstanceOf(TestProcessor);
    engine.destroy();
  });

  test("initial state is 'idle'", () => {
    const engine = new TestEngine();
    expect(engine.state()).toBe("idle");
    engine.destroy();
  });

  test("accepts existing AudioContext in constructor", () => {
    const ctx = new AudioContext();
    const engine = new TestEngine(ctx);
    expect(engine.context).toBe(ctx);
    engine.destroy();
  });

  test("start() resumes context, state becomes 'running'", async () => {
    const engine = new TestEngine();
    await engine.start();
    expect(engine.state()).toBe("running");
    expect(engine.context.state).toBe("running");
    engine.destroy();
  });

  test("start() on already running engine is a no-op", async () => {
    const engine = new TestEngine();
    await engine.start();
    await engine.start();
    expect(engine.state()).toBe("running");
    engine.destroy();
  });

  test("start() on destroyed engine throws", async () => {
    const engine = new TestEngine();
    engine.destroy();
    await expect(engine.start()).rejects.toThrow("Cannot start a destroyed engine");
  });

  test("suspend() pauses context, state becomes 'suspended'", async () => {
    const engine = new TestEngine();
    await engine.start();
    await engine.suspend();
    expect(engine.state()).toBe("suspended");
    expect(engine.context.state).toBe("suspended");
    engine.destroy();
  });

  test("suspend() on non-running engine is a no-op", async () => {
    const engine = new TestEngine();
    await engine.suspend();
    expect(engine.state()).toBe("idle");
    engine.destroy();
  });

  test("suspend() on destroyed engine warns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = new TestEngine();
    engine.destroy();
    await engine.suspend();
    expect(warnSpy).toHaveBeenCalledWith("AudioEngine: suspend() called on a destroyed engine");
    warnSpy.mockRestore();
  });

  test("resume() resumes from suspended, state becomes 'running'", async () => {
    const engine = new TestEngine();
    await engine.start();
    await engine.suspend();
    await engine.resume();
    expect(engine.state()).toBe("running");
    engine.destroy();
  });

  test("resume() on non-suspended engine is a no-op", async () => {
    const engine = new TestEngine();
    await engine.start();
    await engine.resume();
    expect(engine.state()).toBe("running");
    engine.destroy();
  });

  test("resume() on destroyed engine warns", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const engine = new TestEngine();
    engine.destroy();
    await engine.resume();
    expect(warnSpy).toHaveBeenCalledWith("AudioEngine: resume() called on a destroyed engine");
    warnSpy.mockRestore();
  });

  test("destroy() sets state to 'destroyed'", async () => {
    const engine = new TestEngine();
    await engine.start();
    engine.destroy();
    expect(engine.state()).toBe("destroyed");
  });

  test("destroy() cleans up registered processors", () => {
    const engine = createEngine((ctx) => ({
      processor: new TestProcessor(ctx),
    }));
    const destroySpy = vi.spyOn(engine.processor, "destroy");
    engine.core.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });

  test("destroy() is idempotent", () => {
    const engine = new TestEngine();
    engine.destroy();
    // Second destroy should not throw (context already closed)
    expect(() => engine.destroy()).not.toThrow();
  });

  test("untilReady() resolves when state becomes 'running'", async () => {
    const engine = new TestEngine();
    const promise = engine.untilReady();
    await engine.start();
    await expect(promise).resolves.toBeUndefined();
    engine.destroy();
  });

  test("untilReady() resolves immediately if already running", async () => {
    const engine = new TestEngine();
    await engine.start();
    await expect(engine.untilReady()).resolves.toBeUndefined();
    engine.destroy();
  });

  test("untilReady() returns cached promise", () => {
    const engine = new TestEngine();
    const p1 = engine.untilReady();
    const p2 = engine.untilReady();
    expect(p1).toBe(p2);
    engine.destroy();
  });

  test("onstatechange syncs external suspension to state signal", async () => {
    const engine = new TestEngine();
    await engine.start();
    expect(engine.state()).toBe("running");

    // Simulate browser externally suspending the context by calling onstatechange directly
    // In production, the browser fires this when tab goes to background on mobile
    Object.defineProperty(engine.context, "state", { value: "suspended", writable: true });
    engine.context.onstatechange?.call(engine.context, new Event("statechange"));
    expect(engine.state()).toBe("suspended");
    engine.destroy();
  });
});

describe("createEngine", () => {
  test("returns engine with user-defined properties and .core", () => {
    const engine = createEngine((ctx) => {
      const processor = new TestProcessor(ctx);
      return { processor, label: "test" };
    });
    expect(engine.processor).toBeInstanceOf(TestProcessor);
    expect(engine.label).toBe("test");
    expect(engine.core).toBeInstanceOf(AudioEngine);
    engine.core.destroy();
  });

  test("auto-registers AudioProcessor instances", () => {
    const engine = createEngine((ctx) => ({
      processor: new TestProcessor(ctx),
    }));
    const destroySpy = vi.spyOn(engine.processor, "destroy");
    engine.core.destroy();
    expect(destroySpy).toHaveBeenCalled();
  });

  test("setup runs eagerly — properties available immediately", () => {
    const engine = createEngine((ctx) => ({
      processor: new TestProcessor(ctx),
    }));
    expect(engine.processor).toBeInstanceOf(TestProcessor);
    expect(engine.core.state()).toBe("idle");
    engine.core.destroy();
  });

  test("throws on reserved key 'core'", () => {
    expect(() => createEngine(() => ({ core: "oops" }) as any)).toThrow('createEngine: setup returned reserved key "core"');
  });

  test("non-processor values are preserved", () => {
    const fn = () => 42;
    const engine = createEngine(() => ({
      count: 10,
      callback: fn,
      items: [1, 2, 3],
    }));
    expect(engine.count).toBe(10);
    expect(engine.callback).toBe(fn);
    expect(engine.items).toEqual([1, 2, 3]);
    engine.core.destroy();
  });

  test("accepts options.context", () => {
    const ctx = new AudioContext();
    const engine = createEngine(
      (c) => {
        expect(c).toBe(ctx);
        return {};
      },
      { context: ctx },
    );
    expect(engine.core.context).toBe(ctx);
    engine.core.destroy();
  });

  test("full lifecycle: start → suspend → resume → destroy", async () => {
    const engine = createEngine((ctx) => ({
      processor: new TestProcessor(ctx),
    }));

    expect(engine.core.state()).toBe("idle");
    await engine.core.start();
    expect(engine.core.state()).toBe("running");
    await engine.core.suspend();
    expect(engine.core.state()).toBe("suspended");
    await engine.core.resume();
    expect(engine.core.state()).toBe("running");
    engine.core.destroy();
    expect(engine.core.state()).toBe("destroyed");
  });
});
