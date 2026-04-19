import { describe, test, expect, vi } from "vitest";
import * as THREE from "three";
import { createEngine, AudioEngine } from "@audiorective/core";
import { attach } from "../src";

function makeRenderer(): THREE.WebGLRenderer {
  // vitest browser has a real DOM, so we can fake a renderer with just a canvas.
  const canvas = document.createElement("canvas");
  return { domElement: canvas } as unknown as THREE.WebGLRenderer;
}

describe("attach", () => {
  test("accepts a bare AudioEngine", () => {
    const engine = new AudioEngine();
    const renderer = makeRenderer();
    const detach = attach(engine, renderer);
    expect(typeof detach).toBe("function");
    detach();
    engine.destroy();
  });

  test("accepts a createEngine wrapper ({ core })", () => {
    const engine = createEngine(() => ({ x: 1 }));
    const renderer = makeRenderer();
    const detach = attach(engine, renderer);
    expect(typeof detach).toBe("function");
    detach();
    engine.core.destroy();
  });

  test("sets the THREE.AudioContext to the engine's context", () => {
    const engine = new AudioEngine();
    const renderer = makeRenderer();
    const detach = attach(engine, renderer);
    expect(THREE.AudioContext.getContext()).toBe(engine.context);
    detach();
    engine.destroy();
  });

  test("starts the engine on a gesture on renderer.domElement", async () => {
    const engine = new AudioEngine();
    const renderer = makeRenderer();
    const detach = attach(engine, renderer);
    renderer.domElement.dispatchEvent(new Event("click"));
    await engine.untilReady();
    expect(engine.state()).toBe("running");
    detach();
    engine.destroy();
  });

  test("returned detach stops the auto-start listener", () => {
    const engine = new AudioEngine();
    const renderer = makeRenderer();
    const detach = attach(engine, renderer);
    detach();
    const startSpy = vi.spyOn(engine, "start");
    renderer.domElement.dispatchEvent(new Event("click"));
    expect(startSpy).not.toHaveBeenCalled();
    startSpy.mockRestore();
    engine.destroy();
  });
});
