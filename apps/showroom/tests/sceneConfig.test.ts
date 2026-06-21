import { describe, test, expect } from "vitest";
import { CHANNELS } from "../src/audio/sceneConfig";

describe("sceneConfig", () => {
  test("declares six channels with unique ids", () => {
    expect(CHANNELS).toHaveLength(6);
    const ids = CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(6);
  });

  test("source kinds: exactly one synth, one sampler, four streams", () => {
    const kinds = CHANNELS.map((c) => c.kind);
    expect(kinds.filter((k) => k === "synth")).toHaveLength(1);
    expect(kinds.filter((k) => k === "sampler")).toHaveLength(1);
    expect(kinds.filter((k) => k === "stream")).toHaveLength(4);
  });

  test("every channel has a position", () => {
    for (const c of CHANNELS) {
      expect(typeof c.position.x).toBe("number");
      expect(typeof c.position.y).toBe("number");
      expect(typeof c.position.z).toBe("number");
    }
  });
});
