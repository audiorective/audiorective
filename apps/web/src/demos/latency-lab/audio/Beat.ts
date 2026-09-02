import { AudioProcessor, Cell, Sampler } from "@audiorective/core";
import type { DrumKit } from "../../sequencer/audio/drumKit";

type BeatVoiceId = "kick" | "snare" | "hat";

/** Fixed four-on-the-floor kick, backbeat snare, offbeat hats — the demo pattern, not user-editable. */
const PATTERN_STEPS: Record<BeatVoiceId, number[]> = {
  kick: [0, 4, 8, 12],
  snare: [4, 12],
  hat: [2, 6, 10, 14],
};

/** Oldest-dropped ring size for `hits` — enough for the flash row to read recent activity. */
const MAX_HITS = 64;

export interface BeatOptions {
  kit: DrumKit;
}

/** The slice of a tick window `schedule()` reads: the pattern ruler's grid. */
export interface BeatTickWindow {
  rulers: {
    pattern: {
      grid(division: number): Iterable<{ time: number; step: number }>;
    };
  };
}

/**
 * Output-only source for the fixed demo beat: one Sampler per voice, triggered
 * from the owner's clock tick against a fixed pattern. No transport of its own.
 */
export class Beat extends AudioProcessor {
  readonly samplers: Record<BeatVoiceId, Sampler>;
  readonly hits: Cell<{ voice: BeatVoiceId; time: number }[]>;

  private readonly _output: GainNode;

  constructor(ctx: BaseAudioContext, opts: BeatOptions) {
    const output = new GainNode(ctx);
    const samplers: Record<BeatVoiceId, Sampler> = {
      kick: new Sampler(ctx, { buffer: opts.kit.kick, polyphony: 4 }),
      snare: new Sampler(ctx, { buffer: opts.kit.snare, polyphony: 4 }),
      hat: new Sampler(ctx, { buffer: opts.kit.hat, polyphony: 4 }),
    };
    for (const sampler of Object.values(samplers)) sampler.output.connect(output);

    // No params/cells registry: the reactive surface is `hits` below, set directly.
    super(ctx, () => ({}));

    this._output = output;
    this.samplers = samplers;
    this.hits = new Cell<{ voice: BeatVoiceId; time: number }[]>([]);
  }

  get output(): GainNode {
    return this._output;
  }

  schedule(window: BeatTickWindow): void {
    for (const { time, step } of window.rulers.pattern.grid(16)) {
      for (const voice of Object.keys(PATTERN_STEPS) as BeatVoiceId[]) {
        if (!PATTERN_STEPS[voice].includes(step)) continue;
        this.samplers[voice].trigger({ when: time });
        this.hits.update((draft) => {
          draft.push({ voice, time });
          if (draft.length > MAX_HITS) draft.shift();
        });
      }
    }
  }

  destroy(): void {
    for (const sampler of Object.values(this.samplers)) sampler.destroy();
    this._output.disconnect();
    super.destroy();
  }
}
