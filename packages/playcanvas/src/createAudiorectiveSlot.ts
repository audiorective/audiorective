import type { SoundComponent, SoundSlot } from "playcanvas";
import { AudiorectiveSoundSlot, type AudiorectiveSlotOptions } from "./AudiorectiveSoundSlot";

interface SoundComponentInternals {
  _slots: Record<string, SoundSlot>;
}

/**
 * Adds an audiorective-managed {@link SoundSlot} to a `SoundComponent`. Mirrors
 * `SoundComponent.addSlot()` (dup-name check, register, optional autoplay) but
 * constructs an {@link AudiorectiveSoundSlot} so audio can be wired through an
 * audiorective {@link AudioProcessor} pre-panner (3D) or pre-gain (2D).
 *
 * Always prefer this over `component.addSlot()` for audiorective-owned audio,
 * even without a processor — the subclass is the extension point for future
 * audiorective features.
 *
 * @param component - The PlayCanvas SoundComponent the slot is attached to.
 * @param name - Slot name. Must be unique within the component.
 * @param options - Standard {@link SoundSlot} options (volume, loop, asset, …).
 * @param audiorectiveOptions - Audiorective-specific options. Pass `{ processor }`
 *   to wire an FX chain into the per-instance graph; omit for a plain slot.
 * @returns The created {@link AudiorectiveSoundSlot}, or `null` if a slot with
 *   the same name already exists on the component (matching `addSlot()`).
 */
export function createAudiorectiveSlot(
  component: SoundComponent,
  name: string,
  options?: ConstructorParameters<typeof AudiorectiveSoundSlot>[2],
  audiorectiveOptions?: AudiorectiveSlotOptions,
): AudiorectiveSoundSlot | null {
  const internals = component as unknown as SoundComponentInternals;
  if (internals._slots[name]) {
    console.warn(`createAudiorectiveSlot: a sound slot named "${name}" already exists on entity ${component.entity.path}`);
    return null;
  }

  const slot = new AudiorectiveSoundSlot(component, name, options, audiorectiveOptions);
  internals._slots[name] = slot;

  if (slot.autoPlay && component.enabled && component.entity.enabled) {
    slot.play();
  }

  return slot;
}
