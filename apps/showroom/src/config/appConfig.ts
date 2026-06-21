/**
 * Runtime app config — the things a user tweaks without touching code: keybindings,
 * audio asset paths, and the bass note sequence. Loaded from `public/config.json`
 * at boot (edit that file + refresh; no rebuild). Falls back to the defaults below
 * if the file is missing or invalid, so the app always runs.
 */

export type Action =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "toggleHud"
  | "toggleHeadphone"
  | "pad1"
  | "pad2"
  | "pad3"
  | "pad4"
  | "pad5"
  | "pad6"
  | "pad7"
  | "pad8";

export type Keybindings = Record<Action, string[]>;

/** One FX sampler pad (one-shot). Order drives pad1..padN keyboard mapping. */
export interface FxPad {
  id: string;
  label: string;
  url: string;
}

export interface BassConfig {
  /** Note names, e.g. ["A1","A1","E2","G1"]; one plays every other transport step. */
  notes: string[];
  /** Transport tempo for the bass pattern. */
  bpm?: number;
}

export interface AudioConfig {
  /** channelId → stem URL (the `kind: "stream"` channels). */
  stems: Record<string, string>;
  /** FX sampler pads (one-shots). */
  fx: FxPad[];
  /** Bass-synth note sequence. */
  bass: BassConfig;
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
    pad5: ["Digit5"],
    pad6: ["Digit6"],
    pad7: ["Digit7"],
    pad8: ["Digit8"],
  },
  audio: {
    stems: {
      drums: "/stems/drums.mp3",
      synth1: "/stems/synth1.mp3",
      synth2: "/stems/synth2.mp3",
    },
    fx: [
      { id: "vfx1", label: "VFX 1", url: "/fx/vfx1.mp3" },
      { id: "vfx2", label: "VFX 2", url: "/fx/vfx2.mp3" },
      { id: "vfx3", label: "VFX 3", url: "/fx/vfx3.mp3" },
      { id: "vfx4", label: "VFX 4", url: "/fx/vfx4.mp3" },
      { id: "vfx5", label: "VFX 5", url: "/fx/vfx5.mp3" },
      { id: "vfx6", label: "VFX 6", url: "/fx/vfx6.mp3" },
      { id: "vfx7", label: "VFX 7", url: "/fx/vfx7.mp3" },
      { id: "vfx8", label: "VFX 8", url: "/fx/vfx8.mp3" },
    ],
    bass: { notes: ["E1", "E1", "G1", "A1"], bpm: 120 },
    reverb: 0.12,
  },
};

/** Merge a parsed config object over the defaults (objects per-key; arrays replace whole). */
export function mergeConfig(raw: unknown): AppConfig {
  const r = (raw ?? {}) as Partial<AppConfig>;
  return {
    keybindings: { ...DEFAULT_CONFIG.keybindings, ...(r.keybindings ?? {}) },
    audio: {
      stems: { ...DEFAULT_CONFIG.audio.stems, ...(r.audio?.stems ?? {}) },
      fx: r.audio?.fx ?? DEFAULT_CONFIG.audio.fx,
      bass: { ...DEFAULT_CONFIG.audio.bass, ...(r.audio?.bass ?? {}) },
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
