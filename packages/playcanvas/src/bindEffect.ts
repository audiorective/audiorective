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

// Toggle from DevTools to trace splice/cleanup activity per slot/instance:
//   window.__audiorectiveBindEffectDebug = true;
declare global {
  interface Window {
    __audiorectiveBindEffectDebug?: boolean;
  }
}
function debug(...args: unknown[]): void {
  if (typeof window !== "undefined" && window.__audiorectiveBindEffectDebug) {
    console.log("[bindEffect]", ...args);
  }
}

let nextInstanceTag = 1;
const instanceTags = new WeakMap<object, number>();
function tagFor(instance: object): number {
  let t = instanceTags.get(instance);
  if (t === undefined) {
    t = nextInstanceTag++;
    instanceTags.set(instance, t);
  }
  return t;
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
    const tag = tagFor(instance);
    if (!source || !panner) {
      // Not a positional instance, or source not yet created. Pre-panner injection
      // is meaningful only for SoundInstance3d. Leave 2D instances alone.
      debug("splice skipped (no source/panner)", { tag, hasSource: !!source, hasPanner: !!panner });
      return;
    }
    debug("splice", { tag, source, panner, processorInput: input, processorOutput: output });
    // Defensive full-clear: drop any outgoing edges on both source AND output
    // before re-wiring. In non-overlap mode only one instance plays at a time,
    // so output should only ever feed the current instance's panner — if the
    // previous instance's cleanup somehow left an output→old_panner edge alive
    // (e.g. PlayCanvas pooled a panner across instances, or a 'stop'/'end'
    // event was suppressed), `output.connect(new_panner)` would add a second
    // edge and the signal would split between live and dead panners, silently
    // halving EQ effectiveness. Always start from a clean output.
    source.disconnect();
    output.disconnect();
    source.connect(input);
    output.connect(panner);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      debug("cleanup", { tag, panner });
      try {
        output.disconnect(panner);
      } catch {
        // Edge already torn down by the engine; ignore.
      }
      // Also drop source → input — the source is held alive by that edge even
      // after instance.stop() nulls instance.source. Without this, input
      // accumulates a growing list of dead-but-connected sources across track
      // switches. Channel mixing semantics for dead BufferSourceNodes are
      // technically silent per spec, but several browsers have shown subtle
      // mixing/channel-routing quirks; clear the edges and avoid the question.
      try {
        source.disconnect();
      } catch {
        // Already disconnected by the next splice's full-clear.
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

  // 'play' fires on each freshly-created instance.
  // 'resume' fires when an instance comes back from a context-suspend cycle
  // (e.g. tab-switch) — PlayCanvas re-creates the source inside instance.resume()
  // and the new source connects directly to the panner, bypassing any previous
  // splice. Re-splicing on 'resume' keeps the FOH chain attached.
  slot.on("play", splice);
  slot.on("resume", splice);

  let unbound = false;
  return () => {
    if (unbound) return;
    unbound = true;
    slot.off("play", splice);
    slot.off("resume", splice);
    // In-flight instances finish naturally and clean up via their own end/stop listeners.
  };
}
