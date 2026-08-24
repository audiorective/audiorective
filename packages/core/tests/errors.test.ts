import { describe, test, expect, vi, afterEach } from "vitest";
import { AudioEngine, createEngine, EngineEnvironmentError } from "../src";

describe("EngineEnvironmentError", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("new AudioEngine() throws when there is no AudioContext constructor", () => {
    vi.stubGlobal("AudioContext", undefined);

    let caught: unknown;
    try {
      new AudioEngine();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EngineEnvironmentError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe("EngineEnvironmentError");
  });

  test("createEngine() throws before running setup", () => {
    vi.stubGlobal("AudioContext", undefined);
    const setup = vi.fn(() => ({}));

    expect(() => createEngine(setup)).toThrow(EngineEnvironmentError);
    expect(setup).not.toHaveBeenCalled();
  });

  test("an explicitly passed context bypasses the check", () => {
    const context = new AudioContext();
    vi.stubGlobal("AudioContext", undefined);

    expect(() => createEngine(() => ({}), { context })).not.toThrow();
  });

  // The no-window branch of the message can't be reached here: `window` is
  // non-configurable in both Chromium and jsdom. A Node import covers it.
  test("with a window the message points at passing a context", () => {
    vi.stubGlobal("AudioContext", undefined);

    expect(() => createEngine(() => ({}))).toThrow(/createEngine\(setup, \{ context \}\)/);
  });

  test("createEngine() works normally when AudioContext exists", () => {
    const engine = createEngine(() => ({}));

    expect(engine.core).toBeInstanceOf(AudioEngine);
  });
});
