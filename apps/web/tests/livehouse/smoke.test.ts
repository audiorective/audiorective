import { describe, test, expect } from "vitest";

describe("showroom test harness", () => {
  test("AudioContext is available in the browser test env", () => {
    const ctx = new AudioContext();
    expect(ctx).toBeInstanceOf(AudioContext);
    void ctx.close();
  });
});
