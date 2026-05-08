import type { AppBase } from "playcanvas";
import { AudioEngine } from "@audiorective/core";

type EngineOrWrapper = AudioEngine | { core: AudioEngine };

interface SoundManagerInternals {
  _context: AudioContext | null;
  context: AudioContext;
}

export function attach(engine: EngineOrWrapper, app: AppBase): () => void {
  const core = "core" in engine ? engine.core : engine;
  const sound = app.systems.sound as unknown as SoundManagerInternals | undefined;
  if (!sound) {
    throw new Error("attach: app.systems.sound is unavailable. Was the PlayCanvas app constructed with a SoundManager?");
  }

  // PlayCanvas creates its AudioContext lazily on first .context access. If we install
  // the engine's context before any sound plays, both share the same context with no
  // monkey-patching of public API. If PlayCanvas already created a different context,
  // the caller did something out of order — fail loudly with actionable guidance.
  if (sound._context == null) {
    sound._context = core.context;
  } else if (sound._context !== core.context) {
    throw new Error(
      "attach: AudioContext mismatch between PlayCanvas SoundManager and the audiorective engine. " +
        "Call attach(engine, app) before any sound plays, or construct the engine with PlayCanvas's context: " +
        "createEngine(setup, { context: app.systems.sound.context })",
    );
  }

  return core.autoStart(app.graphicsDevice.canvas);
}
