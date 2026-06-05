import type { AppBase } from "playcanvas";
import { AudioEngine } from "@audiorective/core";

type EngineOrWrapper = AudioEngine | { core: AudioEngine };

interface SoundManagerInternals {
  _context: AudioContext | null;
  context: AudioContext | null;
}

export function attach(engine: EngineOrWrapper, app: AppBase): () => void {
  const core = "core" in engine ? engine.core : engine;
  const manager = app.soundManager as unknown as SoundManagerInternals | undefined;
  if (!manager) {
    throw new Error("attach: app.soundManager is unavailable. Was the PlayCanvas app constructed with a SoundManager?");
  }

  // PlayCanvas's SoundManager lazy-creates its AudioContext on first .context access.
  // Installing the engine's context into _context BEFORE that first access means both
  // halves share one context with no monkey-patching of public API. If PlayCanvas
  // already created a different context, the caller did something out of order —
  // fail loudly with actionable guidance.
  if (manager._context == null) {
    manager._context = core.context;
  } else if (manager._context !== core.context) {
    throw new Error(
      "attach: AudioContext mismatch between PlayCanvas SoundManager and the audiorective engine. " +
        "Call attach(engine, app) before any sound plays, or construct the engine with PlayCanvas's context: " +
        "createEngine(setup, { context: app.soundManager.context })",
    );
  }

  return core.autoStart(app.graphicsDevice.canvas);
}
