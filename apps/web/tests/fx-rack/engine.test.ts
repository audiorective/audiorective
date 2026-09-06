import { afterEach, describe, expect, it, vi } from "vitest";
import { engine } from "../../src/demos/fx-rack/audio/engine";
import { FxRack } from "../../src/demos/fx-rack/audio/FxRack";

describe("fx-rack engine.setEngine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes overlapping calls instead of racing to destroy the same rack", async () => {
    await engine.core.start();
    const destroySpy = vi.spyOn(FxRack.prototype, "destroy");
    const before = engine.rack.value;

    const first = engine.setEngine("stretch");
    const second = engine.setEngine("granular");
    await Promise.all([first, second]);

    expect(engine.rack.value.inserts.pitchShift.engine).toBe("granular");
    expect(destroySpy.mock.instances.filter((i) => i === before)).toHaveLength(1);
  });
});
