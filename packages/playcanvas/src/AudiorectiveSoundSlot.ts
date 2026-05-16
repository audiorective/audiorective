import { SoundSlot, Vec3, type Sound, type SoundComponent, type SoundInstance } from "playcanvas";
import type { AudioProcessor } from "@audiorective/core";
import { newAudiorectiveSoundInstance } from "./internal/AudiorectiveSoundInstance";
import { newAudiorectiveSoundInstance3d } from "./internal/AudiorectiveSoundInstance3d";

interface SoundSlotInternals {
  _createInstance(): SoundInstance;
}

export interface AudiorectiveSlotOptions {
  /**
   * Audiorective {@link AudioProcessor} wired into the per-instance graph
   * before the panner (3D) or gain (2D). Built once in
   * `_initializeNodes()` so the FX placement is fixed from the moment the
   * `AudioBufferSourceNode` connects — no live-graph splice. Pass `undefined`
   * to use this slot as a plain audiorective-tagged slot with no FX.
   */
  processor?: AudioProcessor;
}

/**
 * SoundSlot whose `_createInstance` builds an audiorective-aware instance.
 * When a {@link AudioProcessor} is supplied, the processor is wired into the
 * per-instance graph at construction time; otherwise the slot behaves
 * identically to a stock `pc.SoundSlot`.
 *
 * Always prefer this over `pc.SoundComponent.addSlot()` for audio that
 * audiorective should own — even FX-less slots — so future features (PDC,
 * panner config, multi-processor chains) become field additions on
 * {@link AudiorectiveSlotOptions} without API churn.
 */
export class AudiorectiveSoundSlot extends SoundSlot {
  readonly audiorective: Readonly<AudiorectiveSlotOptions>;

  constructor(
    component: SoundComponent,
    name: string,
    options: ConstructorParameters<typeof SoundSlot>[2],
    audiorectiveOptions: AudiorectiveSlotOptions = {},
  ) {
    super(component, name, options);
    this.audiorective = audiorectiveOptions;
  }
}

// `_createInstance` is `private` in playcanvas.d.ts. Patching the prototype
// after declaration sidesteps the TS visibility nominal-match while still
// producing a real override on the subclass prototype chain. We mirror the
// body of the stock implementation (slot.js:_createInstance) and swap the
// constructor for an audiorective-aware instance.
(AudiorectiveSoundSlot.prototype as unknown as SoundSlotInternals)._createInstance = function (this: AudiorectiveSoundSlot): SoundInstance {
  const component = this._component;
  const processor = this.audiorective.processor ?? null;

  let sound: Sound | null = null;
  if (this._asset != null) {
    const asset = this._assets.get(this._asset as unknown as number);
    if (asset) {
      sound = (asset.resource as Sound | undefined) ?? null;
    }
  }

  const data: Record<string, unknown> = {
    volume: this._volume * component.volume,
    pitch: this._pitch * component.pitch,
    loop: this._loop,
    startTime: this._startTime,
    duration: this._duration,
    onPlay: this._onInstancePlayHandler,
    onPause: this._onInstancePauseHandler,
    onResume: this._onInstanceResumeHandler,
    onStop: this._onInstanceStopHandler,
    onEnd: this._onInstanceEndHandler,
  };

  let instance: SoundInstance;
  if (component.positional) {
    const pos = new Vec3();
    pos.copy(component.entity.getPosition());
    data.position = pos;
    data.maxDistance = component.maxDistance;
    data.refDistance = component.refDistance;
    data.rollOffFactor = component.rollOffFactor;
    data.distanceModel = component.distanceModel;
    instance = newAudiorectiveSoundInstance3d(this._manager, sound, data, processor);
  } else {
    instance = newAudiorectiveSoundInstance(this._manager, sound, data, processor);
  }

  if (this._firstNode) {
    instance.setExternalNodes(this._firstNode, this._lastNode);
  }

  return instance;
};
