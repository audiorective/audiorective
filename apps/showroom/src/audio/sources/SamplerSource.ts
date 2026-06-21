import { SoundPlayer } from "@audiorective/core";
import type { Voice } from "@audiorective/core";

/**
 * The FX channel's source: a set of one-shot pads (one polyphonic SoundPlayer per
 * pad id) summed into a single output gain. Pads are created on demand as buffers
 * are loaded, so the pad set is driven entirely by config (no fixed list here).
 */
export class SamplerSource {
  readonly output: GainNode;
  private readonly ctx: AudioContext;
  private readonly _pads = new Map<string, SoundPlayer>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.output = new GainNode(ctx, { gain: 1 });
  }

  /** Load (or replace) a pad's sample; creates the pad's player on first call. */
  setPadBuffer(id: string, buffer: AudioBuffer): void {
    let sp = this._pads.get(id);
    if (!sp) {
      sp = new SoundPlayer(this.ctx, { polyphony: 4, steal: "oldest" });
      sp.output.connect(this.output);
      this._pads.set(id, sp);
    }
    sp.buffer = buffer;
  }

  /** Fire a pad one-shot. Returns null if the pad has no buffer loaded yet. */
  trigger(id: string): Voice | null {
    return this._pads.get(id)?.trigger() ?? null;
  }

  get padIds(): string[] {
    return [...this._pads.keys()];
  }

  destroy(): void {
    for (const sp of this._pads.values()) sp.destroy();
    this._pads.clear();
    this.output.disconnect();
  }
}
