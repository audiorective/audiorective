import { describe, test, expect } from "vitest";
import { CHANNELS, FX_TARGET_CHANNEL } from "../src/audio/sceneConfig";

describe("sceneConfig", () => {
  test("declares five stream channels with unique ids", () => {
    expect(CHANNELS).toHaveLength(5);
    const ids = CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(5);
  });

  test("every channel has a position", () => {
    for (const c of CHANNELS) {
      expect(typeof c.position.x).toBe("number");
      expect(typeof c.position.y).toBe("number");
      expect(typeof c.position.z).toBe("number");
    }
  });

  test("the FX target is an existing channel", () => {
    expect(CHANNELS.some((c) => c.id === FX_TARGET_CHANNEL)).toBe(true);
  });
});
