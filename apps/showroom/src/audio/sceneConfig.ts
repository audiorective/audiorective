import type { Vec3 } from "./spatialMath";

export type SourceKind = "stream" | "sampler";

export interface ChannelDef {
  id: string;
  label: string;
  color: string;
  kind: SourceKind;
  position: Vec3;
}

/**
 * The band: five streamed stems (drums, bass, two synths, vox) + an FX sampler.
 * Fixed scene identity (id/label/color/kind/default position). User-tweakable
 * audio file paths live in `config.json` (see `config/appConfig.ts`), keyed by
 * channel id.
 */
export const CHANNELS: readonly ChannelDef[] = [
  { id: "drums", label: "Drums", color: "#dc2626", kind: "stream", position: { x: 0, y: 1.0, z: -5 } },
  { id: "bass", label: "Bass", color: "#7c3aed", kind: "stream", position: { x: -1.5, y: 1.0, z: -4.5 } },
  { id: "synth1", label: "Synth 1", color: "#16a34a", kind: "stream", position: { x: -3.5, y: 1.4, z: -4 } },
  { id: "synth2", label: "Synth 2", color: "#2563eb", kind: "stream", position: { x: 3.5, y: 1.4, z: -4 } },
  { id: "vox", label: "Vox", color: "#ec4899", kind: "stream", position: { x: 0, y: 1.7, z: -3.2 } },
  { id: "fx", label: "FX", color: "#d97706", kind: "sampler", position: { x: 1.5, y: 2.1, z: -3 } },
] as const;
