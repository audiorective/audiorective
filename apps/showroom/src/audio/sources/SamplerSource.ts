import { SoundPlayer } from "@audiorective/core";
import type { Voice } from "@audiorective/core";

export type PadId = "boom" | "riser" | "airhorn" | "applause";
export const PAD_IDS: readonly PadId[] = ["boom", "riser", "airhorn", "applause"];

/**
 * The Sampler channel's source. A looping bed (one SoundPlayer, loop) plus one
 * polyphonic SoundPlayer per pad sound; all sum into a single output gain.
 */
export class SamplerSource {
  readonly output: GainNode;
  private readonly _bed: SoundPlayer;
  private readonly _pads: Record<PadId, SoundPlayer>;

  constructor(ctx: AudioContext) {
    this.output = new GainNode(ctx, { gain: 1 });

    this._bed = new SoundPlayer(ctx, { loop: true, polyphony: 1 });
    this._bed.output.connect(this.output);

    this._pads = {} as Record<PadId, SoundPlayer>;
    for (const id of PAD_IDS) {
      const sp = new SoundPlayer(ctx, { polyphony: 4, steal: "oldest" });
      sp.output.connect(this.output);
      this._pads[id] = sp;
    }
  }

  setBedBuffer(buffer: AudioBuffer): void {
    this._bed.buffer = buffer;
  }

  setPadBuffer(id: PadId, buffer: AudioBuffer): void {
    this._pads[id].buffer = buffer;
  }

  startBed(): Voice | null {
    return this._bed.trigger({ loop: true });
  }

  stopBed(): void {
    this._bed.stopAll();
  }

  trigger(id: PadId): Voice | null {
    return this._pads[id].trigger();
  }

  get bedActiveVoices(): number {
    return this._bed.cells.activeVoices.value;
  }

  destroy(): void {
    this._bed.destroy();
    for (const id of PAD_IDS) this._pads[id].destroy();
    this.output.disconnect();
  }
}
