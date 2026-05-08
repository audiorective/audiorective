import { describe, test, expect, vi } from "vitest";
import { AudioEngine, createEngine } from "@audiorective/core";
import { attach } from "../src";

interface FakeApp {
  systems: { sound?: { _context: AudioContext | null; context: AudioContext } };
  graphicsDevice: { canvas: HTMLCanvasElement };
}

function makeApp(soundContext: AudioContext | null): FakeApp {
  const canvas = document.createElement("canvas");
  return {
    systems: {
      sound:
        soundContext === null
          ? {
              _context: null,
              get context(): AudioContext {
                throw new Error("not set");
              },
            }
          : { _context: soundContext, context: soundContext },
    },
    graphicsDevice: { canvas },
  };
}

describe("attach", () => {
  test("installs the engine's context into a SoundManager that hasn't created one yet", () => {
    const engine = new AudioEngine();
    const app = makeApp(null);

    const dispose = attach(engine, app as never);
    expect(app.systems.sound!._context).toBe(engine.context);
    dispose();
  });

  test("accepts a createEngine wrapper alongside a bare AudioEngine", () => {
    const created = createEngine(() => ({}));
    const app = makeApp(null);

    const dispose = attach(created, app as never);
    expect(app.systems.sound!._context).toBe(created.core.context);
    dispose();
  });

  test("validates context identity when SoundManager already has one", () => {
    const engine = new AudioEngine();
    const app = makeApp(engine.context);

    const dispose = attach(engine, app as never);
    dispose();
  });

  test("throws on context mismatch with actionable guidance", () => {
    const engine = new AudioEngine();
    const otherContext = new AudioContext();
    const app = makeApp(otherContext);

    expect(() => attach(engine, app as never)).toThrow(/AudioContext mismatch/);
  });

  test("returns autoStart's disposer; calling it removes gesture listeners", async () => {
    const engine = new AudioEngine();
    const app = makeApp(null);
    await engine.context.suspend();

    const removeSpy = vi.spyOn(app.graphicsDevice.canvas, "removeEventListener");
    const dispose = attach(engine, app as never);
    dispose();

    expect(removeSpy).toHaveBeenCalled();
    removeSpy.mockRestore();
  });
});
