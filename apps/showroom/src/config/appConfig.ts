import type { PadId } from "../audio/sources/SamplerSource";

/**
 * Runtime app config — the two things a user tweaks without touching code:
 * keybindings and audio asset paths. Loaded from `public/config.json` at boot
 * (edit that file + refresh; no rebuild). Falls back to the defaults below if the
 * file is missing or invalid, so the app always runs.
 */

export type Action = "forward" | "back" | "left" | "right" | "toggleHud" | "toggleHeadphone" | "pad1" | "pad2" | "pad3" | "pad4";

export type Keybindings = Record<Action, string[]>;

export interface AudioConfig {
  /** channelId → stem URL (only the `kind: "stream"` channels). */
  stems: Record<string, string>;
  /** Sampler bed loop + one-shot pad URLs. */
  sampler: Partial<Record<"bed" | PadId, string>>;
  /** Convolver impulse response URL; omitted → synthesized IR. */
  reverbIR?: string;
  /** Reverb send amount (wet gain, 0..1). */
  reverb?: number;
}

export interface AppConfig {
  keybindings: Keybindings;
  audio: AudioConfig;
}

export const DEFAULT_CONFIG: AppConfig = {
  keybindings: {
    forward: ["KeyW", "ArrowUp"],
    back: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    toggleHud: ["Tab"],
    toggleHeadphone: ["KeyH"],
    pad1: ["Digit1"],
    pad2: ["Digit2"],
    pad3: ["Digit3"],
    pad4: ["Digit4"],
  },
  audio: {
    stems: {
      guitar1: "/stems/guitar1.mp3",
      guitar2: "/stems/guitar2.mp3",
      drums: "/stems/drums.mp3",
      bass: "/stems/bass.mp3",
    },
    sampler: {
      bed: "/sfx/bed.mp3",
      boom: "/sfx/boom.mp3",
      riser: "/sfx/riser.mp3",
      airhorn: "/sfx/airhorn.mp3",
      applause: "/sfx/applause.mp3",
    },
    reverbIR: "/ir/room.wav",
    reverb: 0.12,
  },
};

/** Deep-merge a parsed config object over the defaults (per-key override). */
export function mergeConfig(raw: unknown): AppConfig {
  const r = (raw ?? {}) as Partial<AppConfig>;
  return {
    keybindings: { ...DEFAULT_CONFIG.keybindings, ...(r.keybindings ?? {}) },
    audio: {
      stems: { ...DEFAULT_CONFIG.audio.stems, ...(r.audio?.stems ?? {}) },
      sampler: { ...DEFAULT_CONFIG.audio.sampler, ...(r.audio?.sampler ?? {}) },
      reverbIR: r.audio?.reverbIR ?? DEFAULT_CONFIG.audio.reverbIR,
      reverb: r.audio?.reverb ?? DEFAULT_CONFIG.audio.reverb,
    },
  };
}

let active: AppConfig = DEFAULT_CONFIG;

/** The currently-active config (defaults until `loadAppConfig` resolves). */
export function getConfig(): AppConfig {
  return active;
}

/** Fetch + merge `public/config.json`; on any failure keep the defaults. */
export async function loadAppConfig(url = "/config.json"): Promise<AppConfig> {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.ok) active = mergeConfig(await res.json());
  } catch {
    // keep defaults
  }
  return active;
}

/** Resolve a keyboard event to its bound action via the active (or given) keybindings. */
export function matchAction(e: Pick<KeyboardEvent, "code">, keys: Keybindings = active.keybindings): Action | null {
  for (const action of Object.keys(keys) as Action[]) {
    if (keys[action]?.includes(e.code)) return action;
  }
  return null;
}
