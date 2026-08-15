import type { Vec3 } from "./spatialMath";

export interface ChannelDef {
  id: string;
  label: string;
  color: string;
  position: Vec3;
}

/**
 * The band: five streamed stems (drums, bass, two synths, vox). Fixed scene
 * identity (id/label/color/default position). User-tweakable audio file paths
 * live in `config.json` (see `config/appConfig.ts`), keyed by channel id.
 *
 * The FX sampler is NOT a channel: its pads are the same vocal content as Vox
 * (triggered by hand instead of with the track), so its output is routed into
 * the Vox channel — sharing Vox's EQ, fader, spatial position, and panning.
 */
export const CHANNELS: readonly ChannelDef[] = [
  { id: "drums", label: "Drums", color: "#dc2626", position: { x: 0, y: 1.0, z: -5 } },
  { id: "bass", label: "Bass", color: "#7c3aed", position: { x: -1.5, y: 1.0, z: -4.5 } },
  { id: "synth1", label: "Synth 1", color: "#16a34a", position: { x: -3.5, y: 1.4, z: -4 } },
  { id: "synth2", label: "Synth 2", color: "#2563eb", position: { x: 3.5, y: 1.4, z: -4 } },
  { id: "vox", label: "Vox", color: "#ec4899", position: { x: 0, y: 1.7, z: -3.2 } },
] as const;

/** The channel the FX sampler feeds into (its pads are Vox content, triggered manually). */
export const FX_TARGET_CHANNEL = "vox";
