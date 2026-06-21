import { describe, test, expect } from "vitest";
import { DEFAULT_CONFIG, mergeConfig, matchAction } from "../src/config/appConfig";

const ev = (code: string) => ({ code }) as KeyboardEvent;

describe("appConfig", () => {
  test("mergeConfig falls back to defaults for an empty object", () => {
    expect(mergeConfig({})).toEqual(DEFAULT_CONFIG);
  });

  test("mergeConfig overrides only the provided keys", () => {
    const merged = mergeConfig({ keybindings: { toggleHud: ["KeyM"] }, audio: { stems: { drums: "/x/drums.wav" } } });
    expect(merged.keybindings.toggleHud).toEqual(["KeyM"]);
    expect(merged.keybindings.forward).toEqual(DEFAULT_CONFIG.keybindings.forward); // untouched
    expect(merged.audio.stems.drums).toBe("/x/drums.wav");
    expect(merged.audio.stems.synth1).toBe(DEFAULT_CONFIG.audio.stems.synth1); // untouched
    expect(merged.audio.fx).toEqual(DEFAULT_CONFIG.audio.fx); // untouched
    expect(merged.audio.reverb).toBe(DEFAULT_CONFIG.audio.reverb);
  });

  test("mergeConfig overrides the reverb amount when provided", () => {
    expect(mergeConfig({ audio: { reverb: 0.4 } }).audio.reverb).toBe(0.4);
  });

  test("mergeConfig replaces the fx pad list and merges bass", () => {
    const fx = [{ id: "x", label: "X", url: "/x.mp3" }];
    const merged = mergeConfig({ audio: { fx, bass: { notes: ["C2"] } } });
    expect(merged.audio.fx).toEqual(fx);
    expect(merged.audio.bass.notes).toEqual(["C2"]);
    expect(merged.audio.bass.bpm).toBe(DEFAULT_CONFIG.audio.bass.bpm); // merged, not dropped
  });

  test("matchAction resolves single + multi-key bindings against a given map", () => {
    const k = mergeConfig({}).keybindings;
    expect(matchAction(ev("Tab"), k)).toBe("toggleHud");
    expect(matchAction(ev("KeyW"), k)).toBe("forward");
    expect(matchAction(ev("ArrowUp"), k)).toBe("forward");
    expect(matchAction(ev("KeyZ"), k)).toBeNull();
  });
});
