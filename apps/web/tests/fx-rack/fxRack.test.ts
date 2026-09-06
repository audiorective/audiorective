import { describe, expect, it } from "vitest";
import { renderOffline } from "@audiorective/core";
import { FxRack, makeImpulseResponse } from "../../src/demos/fx-rack/audio/FxRack";
import { createDrumKit } from "../../src/demos/sequencer/audio/drumKit";

const peak = (b: AudioBuffer) => {
  let m = 0;
  for (let c = 0; c < b.numberOfChannels; c++) for (const v of b.getChannelData(c)) m = Math.max(m, Math.abs(v));
  return m;
};
const db = (x: number) => 20 * Math.log10(x);

async function renderRack(configure: (rack: FxRack) => void) {
  return renderOffline({ seconds: 2 }, async (ctx) => {
    const rack = new FxRack(ctx, { kit: createDrumKit(ctx), loop: null });
    rack.output.connect(ctx.destination);
    await rack.ready;
    configure(rack);
    rack.scheduleBars(1, 120, 0);
  });
}

describe("FxRack", () => {
  it("renders one bar of pads, non-silent and under the limiter ceiling", async () => {
    const buf = await renderRack((rack) => {
      rack.limiter.params.threshold.value = -3;
    });
    expect(peak(buf)).toBeGreaterThan(0.05);
    expect(db(peak(buf))).toBeLessThanOrEqual(-3 + 0.1);
  });
  it("wet = 0 on every insert reproduces the plain pad sum (aligned by PDC)", async () => {
    const dry = await renderRack((rack) => {
      for (const fx of Object.values(rack.inserts)) fx.params.wet.value = 0;
      rack.compressor.params.wet.value = 0;
      rack.limiter.params.wet.value = 0;
    });
    const ref = await renderOffline({ seconds: 2 }, (ctx) => {
      const kit = createDrumKit(ctx);
      const rack = new FxRack(ctx, { kit, loop: null }); // only for its schedule; route pads straight out
      for (const pad of Object.values(rack.pads)) pad.output.connect(ctx.destination);
      rack.scheduleBars(1, 120, 0);
    });
    const a = dry.getChannelData(0),
      b = ref.getChannelData(0);
    // the rack's graph has latency L (pitch window + lookahead); compare after shifting by it
    let best = Infinity,
      bestShift = 0;
    for (let shift = 0; shift < 12000; shift += 1) {
      let e = 0;
      for (let i = 0; i < 20000; i += 7) e += Math.abs((a[i + shift] ?? 0) - b[i]!);
      if (e < best) {
        best = e;
        bestShift = shift;
      }
    }
    expect(best / (20000 / 7)).toBeLessThan(1e-3);
    expect(bestShift).toBeGreaterThan(0);
  });
  it("makeImpulseResponse decays", () => {
    const ctx = new OfflineAudioContext(2, 128, 44100);
    const ir = makeImpulseResponse(ctx, 1, 4);
    const d = ir.getChannelData(0);
    expect(Math.abs(d[100]!)).toBeGreaterThan(Math.abs(d[d.length - 100]!) * 10);
  });
});
