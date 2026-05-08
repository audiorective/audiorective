import type { SoundSlot, SoundInstance } from "playcanvas";
import { AudioProcessor } from "@audiorective/core";

export interface BindEffectOptions {
  /**
   * Where to insert the processor relative to the per-instance panner.
   *
   * - `"pre"` (default): source → processor → panner → gain → destination.
   *   The semantically correct position for source-character processing
   *   (FOH-style EQ, bus compression, instrument coloration). Implemented
   *   via per-instance live-graph splice on the slot's `play` event.
   * - `"post"`: source → panner → gain → processor → destination.
   *   Correct for ear / headphone / room-correction effects. Implemented
   *   via PlayCanvas's stock `slot.setExternalNodes`.
   */
  position?: "pre" | "post";
}

interface SoundInstance3dInternals {
  source?: AudioBufferSourceNode | null;
  panner?: PannerNode;
}

export function bindEffect(slot: SoundSlot, processor: AudioProcessor, options: BindEffectOptions = {}): () => void {
  const position = options.position ?? "pre";
  const input = processor.input;
  const output = processor.output;

  if (!input || !output) {
    throw new Error(
      "bindEffect: processor must be effect-shaped (both .input and .output defined). " +
        "This looks like an instrument — instruments only declare .output and have nowhere to inject incoming audio.",
    );
  }

  if (position === "post") {
    slot.setExternalNodes(input, output);
    let cleared = false;
    return () => {
      if (cleared) return;
      cleared = true;
      slot.clearExternalNodes();
    };
  }

  // Pre-panner: PlayCanvas does not expose a public hook between source and panner.
  // Workaround #2 from the audiorective PlayCanvas audit: on each play, splice the
  // processor into the live source → panner edge of the SoundInstance3d.
  const splice = (instance: SoundInstance) => {
    const internals = instance as unknown as SoundInstance3dInternals;
    const { source, panner } = internals;
    if (!source || !panner) {
      // Not a positional instance, or source not yet created. Pre-panner injection
      // is meaningful only for SoundInstance3d. Leave 2D instances alone.
      return;
    }
    try {
      source.disconnect(panner);
    } catch {
      // Already disconnected (rare race); proceed to splice from source forward.
    }
    source.connect(input);
    output.connect(panner);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        output.disconnect(panner);
      } catch {
        // Edge already torn down by the engine; ignore.
      }
      instance.off("end", cleanup);
      instance.off("stop", cleanup);
    };
    instance.once("end", cleanup);
    instance.once("stop", cleanup);
  };

  // Splice into any instances already playing.
  for (const instance of slot.instances) {
    splice(instance);
  }

  slot.on("play", splice);

  let unbound = false;
  return () => {
    if (unbound) return;
    unbound = true;
    slot.off("play", splice);
    // In-flight instances finish naturally and clean up via their own end/stop listeners.
  };
}
