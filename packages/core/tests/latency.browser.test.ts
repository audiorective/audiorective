import { describe, expect, it } from "vitest";
import { AudioProcessor, Param } from "../src";

class Plain extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    super(ctx, () => ({}));
  }
  get output() {
    return undefined;
  }
}

class Declared extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    super(ctx, () => ({ latency: 512 }));
  }
  get output() {
    return undefined;
  }
}

class DeclaredParam extends AudioProcessor {
  constructor(ctx: BaseAudioContext) {
    super(ctx, ({ param }) => ({ latency: param({ default: 128 }) }));
  }
  get output() {
    return undefined;
  }
}

describe("AudioProcessor.latency", () => {
  it("defaults to 0 and is a Param", () => {
    const p = new Plain(new AudioContext());
    expect(p.latency).toBeInstanceOf(Param);
    expect(p.latency.value).toBe(0);
    expect(p.declaredLatency).toBe(false);
  });

  it("accepts a number declaration", () => {
    const p = new Declared(new AudioContext());
    expect(p.latency.value).toBe(512);
    expect(p.declaredLatency).toBe(true);
  });

  it("accepts a Param declaration that stays writable", () => {
    const p = new DeclaredParam(new AudioContext());
    expect(p.latency.value).toBe(128);
    p.latency.value = 256;
    expect(p.latency.value).toBe(256);
  });

  it("constructs against an OfflineAudioContext", () => {
    const ctx = new OfflineAudioContext(1, 128, 44100);
    const p = new Plain(ctx);
    expect(p.context).toBe(ctx);
  });
});
