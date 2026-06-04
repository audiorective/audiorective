import { SoundInstance, type Sound, type SoundManager } from "playcanvas";
import type { AudioProcessor } from "@audiorective/core";

interface SoundInstanceInternals {
  _manager: SoundManager & { context: AudioContext };
  gain: GainNode;
  _inputNode: AudioNode;
  _connectorNode: AudioNode;
  _initializeNodes(): void;
}

/**
 * Non-positional sound instance with an audiorective processor wired
 * pre-gain. Built once in `_initializeNodes()` so the graph is correct from
 * the moment `_createSource()` runs — no live splice, no per-play listeners.
 *
 * Graph: source → processor.input → … → processor.output → gain → destination.
 */
export class AudiorectiveSoundInstance extends SoundInstance {
  // Carries the processor across the `super()` call: the parent constructor
  // invokes `this._initializeNodes()` polymorphically before our constructor
  // body runs, so we can't pass it via `this`. Browser construction is
  // synchronous and single-threaded, so a class-static slot is safe.
  static __pendingProcessor: AudioProcessor | null = null;
}

// `_initializeNodes` is `private` in playcanvas.d.ts and TS treats two private
// declarations as non-substitutable. Patching the prototype after declaration
// sidesteps the visibility nominal-match while still producing a proper
// instance method on the subclass prototype chain.
(AudiorectiveSoundInstance.prototype as unknown as SoundInstanceInternals)._initializeNodes = function (this: SoundInstanceInternals): void {
  const ctx = this._manager.context;
  if (!ctx) return;

  const processor = AudiorectiveSoundInstance.__pendingProcessor;
  if (!processor) {
    // No processor bound — fall back to the stock graph so a slot created
    // via createAudiorectiveSlot() without options is byte-equivalent to
    // a stock slot.
    const stock = SoundInstance.prototype as unknown as SoundInstanceInternals;
    stock._initializeNodes.call(this);
    return;
  }

  const input = processor.input;
  const output = processor.output;
  if (!input || !output) {
    throw new Error(
      "AudiorectiveSoundInstance: processor must be effect-shaped (both .input and .output defined). " +
        "This looks like an instrument — instruments only declare .output and have nowhere to inject incoming audio.",
    );
  }

  const gain = ctx.createGain();
  output.connect(gain);
  gain.connect(ctx.destination);

  this.gain = gain;
  this._inputNode = input;
  this._connectorNode = gain;
};

/**
 * Helper that constructs an {@link AudiorectiveSoundInstance} with the given
 * processor, planting it via the static pending slot for the duration of
 * `super()`.
 */
export function newAudiorectiveSoundInstance(
  manager: SoundManager,
  sound: Sound | null,
  options: Record<string, unknown>,
  processor: AudioProcessor | null,
): AudiorectiveSoundInstance {
  AudiorectiveSoundInstance.__pendingProcessor = processor;
  try {
    return new AudiorectiveSoundInstance(manager, sound as Sound, options);
  } finally {
    AudiorectiveSoundInstance.__pendingProcessor = null;
  }
}
