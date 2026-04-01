/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from "vitest";

// Mock AudioContext before any imports that construct engines
class MockGainNode {
  gain = { value: 0 };
  connect() {}
  disconnect() {}
}

class MockAudioContext {
  state = "suspended" as AudioContextState;
  onstatechange: ((this: BaseAudioContext, ev: Event) => any) | null = null;

  async resume() {
    this.state = "running";
    this.onstatechange?.call(this as any, new Event("statechange"));
  }
  async suspend() {
    this.state = "suspended";
    this.onstatechange?.call(this as any, new Event("statechange"));
  }
  close() {
    this.state = "closed" as AudioContextState;
  }
  createGain() {
    return new MockGainNode();
  }
  createConstantSource() {
    return { offset: { value: 0 }, connect() {}, start() {}, disconnect() {} };
  }
  get destination() {
    return {};
  }
  get currentTime() {
    return 0;
  }
}

vi.stubGlobal("AudioContext", MockAudioContext);
vi.stubGlobal("GainNode", MockGainNode);
vi.stubGlobal("AudioParam", class {});

import { describe, test, expect, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { createEngine, AudioProcessor, createEngine as _createEngine } from "@audiorective/core";
import { createEngineContext, createProcessorContext } from "../src/context";
import React from "react";

afterEach(() => {
  cleanup();
});

class DummyProcessor extends AudioProcessor {
  readonly vol = this.param({ default: 0.5 });
  constructor(ctx: AudioContext) {
    super(ctx);
  }
  get output(): AudioNode | undefined {
    return undefined;
  }
}

function makeEngine() {
  return createEngine((ctx) => {
    const processor = new DummyProcessor(ctx);
    return { processor };
  });
}

describe("createEngineContext", () => {
  describe("EngineProvider (overlay mode — no fallback)", () => {
    test("always renders children regardless of engine state", () => {
      const engine = makeEngine();
      const { EngineProvider } = createEngineContext(engine);

      render(
        <EngineProvider>
          <div data-testid="child">hello</div>
        </EngineProvider>,
      );

      expect(screen.getByTestId("child")).toBeTruthy();
      expect(engine.state.get()).toBe("idle");
      engine.destroy();
    });

    test("useEngine() works in overlay mode", () => {
      const engine = makeEngine();
      const { EngineProvider, useEngine } = createEngineContext(engine);

      function Inner() {
        const e = useEngine();
        return <div data-testid="processor">{e.processor.vol.value}</div>;
      }

      render(
        <EngineProvider>
          <Inner />
        </EngineProvider>,
      );

      expect(screen.getByTestId("processor").textContent).toBe("0.5");
      engine.destroy();
    });
  });

  describe("useEngine", () => {
    test("throws outside provider", () => {
      const engine = makeEngine();
      const { useEngine } = createEngineContext(engine);

      function Bad() {
        useEngine();
        return null;
      }

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() => render(<Bad />)).toThrow("useEngine must be used within an EngineProvider");
      consoleSpy.mockRestore();
      engine.destroy();
    });
  });

  describe("autoStart", () => {
    test("calls engine.start() on click in overlay mode", async () => {
      const engine = makeEngine();
      const startSpy = vi.spyOn(engine, "start");
      const { EngineProvider } = createEngineContext(engine);

      render(
        <EngineProvider>
          <div data-testid="child">hello</div>
        </EngineProvider>,
      );

      await act(async () => {
        fireEvent.click(document);
      });

      expect(startSpy).toHaveBeenCalled();
      engine.destroy();
    });

    test("removes listeners after first gesture", async () => {
      const engine = makeEngine();
      const startSpy = vi.spyOn(engine, "start");
      const { EngineProvider } = createEngineContext(engine);

      render(
        <EngineProvider>
          <div>hello</div>
        </EngineProvider>,
      );

      await act(async () => {
        fireEvent.click(document);
      });

      startSpy.mockClear();
      await act(async () => {
        fireEvent.click(document);
      });

      expect(startSpy).not.toHaveBeenCalled();
      engine.destroy();
    });

    test("explicit autoStart={false} disables in overlay mode", async () => {
      const engine = makeEngine();
      const startSpy = vi.spyOn(engine, "start");
      const { EngineProvider } = createEngineContext(engine);

      render(
        <EngineProvider autoStart={false}>
          <div>hello</div>
        </EngineProvider>,
      );

      await act(async () => {
        fireEvent.click(document);
      });

      expect(startSpy).not.toHaveBeenCalled();
      engine.destroy();
    });

    test("re-arms listeners when engine state drops from running", async () => {
      const engine = makeEngine();
      const { EngineProvider } = createEngineContext(engine);

      render(
        <EngineProvider>
          <div>hello</div>
        </EngineProvider>,
      );

      // First gesture starts the engine
      await act(async () => {
        fireEvent.click(document);
      });
      expect(engine.state.get()).toBe("running");

      // Simulate mobile background suspend
      await act(async () => {
        await engine.suspend();
      });
      expect(engine.state.get()).toBe("suspended");

      // Next gesture should re-start
      await act(async () => {
        fireEvent.click(document);
      });
      expect(engine.state.get()).toBe("running");

      engine.destroy();
    });
  });
});

describe("createProcessorContext", () => {
  test("useProcessor() returns processor from provider", () => {
    const { Provider, useProcessor } = createProcessorContext<DummyProcessor>();
    const ctx = new AudioContext() as any;
    const processor = new DummyProcessor(ctx);

    function Inner() {
      const p = useProcessor();
      return <div data-testid="vol">{p.vol.value}</div>;
    }

    render(
      <Provider value={processor}>
        <Inner />
      </Provider>,
    );

    expect(screen.getByTestId("vol").textContent).toBe("0.5");
  });

  test("useProcessor() throws outside provider", () => {
    const { useProcessor } = createProcessorContext<DummyProcessor>();

    function Bad() {
      useProcessor();
      return null;
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow("useProcessor must be used within a Provider");
    consoleSpy.mockRestore();
  });
});
