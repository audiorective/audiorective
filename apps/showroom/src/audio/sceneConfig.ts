import type { Vec3 } from "./spatialMath";

export type SourceKind = "stream" | "synth" | "sampler";

export interface ChannelDef {
  id: string;
  label: string;
  color: string;
  kind: SourceKind;
  position: Vec3;
  /** For `kind: "stream"` — path to the stem (user-provided; missing → silent). */
  src?: string;
}

/** The band: four streamed stems + one synth + one sampler. */
export const CHANNELS: readonly ChannelDef[] = [
  { id: "guitar1", label: "Guitar 1", color: "#16a34a", kind: "stream", src: "/stems/guitar1.mp3", position: { x: -3.5, y: 1.4, z: -4 } },
  { id: "guitar2", label: "Guitar 2", color: "#22c55e", kind: "stream", src: "/stems/guitar2.mp3", position: { x: 3.5, y: 1.4, z: -4 } },
  { id: "drums", label: "Drums", color: "#dc2626", kind: "stream", src: "/stems/drums.mp3", position: { x: 0, y: 1.0, z: -5 } },
  { id: "bass", label: "Bass", color: "#7c3aed", kind: "stream", src: "/stems/bass.mp3", position: { x: -1.5, y: 1.0, z: -4.5 } },
  { id: "synth", label: "Synth", color: "#2563eb", kind: "synth", position: { x: 1.5, y: 1.8, z: -4.5 } },
  { id: "sampler", label: "Sampler", color: "#d97706", kind: "sampler", position: { x: 0, y: 2.2, z: -3 } },
] as const;
