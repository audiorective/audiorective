import { SoundInstance3d, type Sound, type SoundManager } from "playcanvas";
import type { AudioProcessor } from "@audiorective/core";

interface SoundInstance3dInternals {
  _manager: SoundManager & { context: AudioContext };
  gain: GainNode;
  panner: PannerNode;
  _inputNode: AudioNode;
  _connectorNode: AudioNode;
  _initializeNodes(): void;
}

/**
 * Positional sound instance with an audiorective processor wired pre-panner.
 * Built once in `_initializeNodes()` so the graph is correct from the moment
 * `_createSource()` runs — no live splice, no per-play listeners.
 *
 * Graph: source → processor.input → … → processor.output → panner → gain → destination.
 *
 * `this.panner` remains the standard `PannerNode` PlayCanvas operates on, so
 * every positional setter on the parent class (position, maxDistance,
 * refDistance, rollOffFactor, distanceModel) continues to work unchanged.
 */
export class AudiorectiveSoundInstance3d extends SoundInstance3d {
  static __pendingProcessor: AudioProcessor | null = null;
}

(AudiorectiveSoundInstance3d.prototype as unknown as SoundInstance3dInternals)._initializeNodes = function (this: SoundInstance3dInternals): void {
  const ctx = this._manager.context;
  if (!ctx) return;

  const processor = AudiorectiveSoundInstance3d.__pendingProcessor;
  if (!processor) {
    const stock = SoundInstance3d.prototype as unknown as SoundInstance3dInternals;
    stock._initializeNodes.call(this);
    return;
  }

  const input = processor.input;
  const output = processor.output;
  if (!input || !output) {
    throw new Error(
      "AudiorectiveSoundInstance3d: processor must be effect-shaped (both .input and .output defined). " +
        "This looks like an instrument — instruments only declare .output and have nowhere to inject incoming audio.",
    );
  }

  const gain = ctx.createGain();
  const panner = ctx.createPanner();
  output.connect(panner);
  panner.connect(gain);
  gain.connect(ctx.destination);

  this.gain = gain;
  this.panner = panner;
  this._inputNode = input;
  this._connectorNode = gain;
};

export function newAudiorectiveSoundInstance3d(
  manager: SoundManager,
  sound: Sound | null,
  options: Record<string, unknown>,
  processor: AudioProcessor | null,
): AudiorectiveSoundInstance3d {
  AudiorectiveSoundInstance3d.__pendingProcessor = processor;
  try {
    return new AudiorectiveSoundInstance3d(manager, sound as Sound, options);
  } finally {
    AudiorectiveSoundInstance3d.__pendingProcessor = null;
  }
}
