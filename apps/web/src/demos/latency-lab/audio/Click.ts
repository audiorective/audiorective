import { AudioProcessor, Cell, type Param } from "@audiorective/core";

/** Oldest-dropped ring size for `ticks`. */
const MAX_TICKS = 64;

/** Envelope shape for the enveloped 1 kHz burst. */
const FREQUENCY_HZ = 1000;
const ATTACK_SECONDS = 0.001;
const DECAY_SECONDS = 0.03;
const BURST_SECONDS = 0.04;

/** The slice of a tick window `schedule()` reads: the pattern ruler's grid. */
export interface ClickTickWindow {
  rulers: {
    pattern: {
      grid(division: number): Iterable<{ time: number; step: number }>;
    };
  };
}

/**
 * Output-only metronome: a fresh oscillator burst per beat, gated by `enabled`.
 * No transport of its own — the owner's clock drives `schedule()`.
 */
export class Click extends AudioProcessor<{ enabled: Param<boolean> }> {
  readonly enabled: Param<boolean>;
  readonly ticks: Cell<number[]>;

  private readonly _output: GainNode;

  constructor(ctx: BaseAudioContext) {
    const output = new GainNode(ctx);

    super(ctx, ({ param }) => ({
      params: { enabled: param<boolean>({ default: true, label: "Click enabled" }) },
    }));

    this._output = output;
    this.enabled = this.params.enabled;
    this.ticks = new Cell<number[]>([]);
  }

  get output(): GainNode {
    return this._output;
  }

  schedule(window: ClickTickWindow): void {
    if (!this.enabled.value) return;
    for (const { time } of window.rulers.pattern.grid(4)) {
      this._burst(time);
      this.ticks.update((draft) => {
        draft.push(time);
        if (draft.length > MAX_TICKS) draft.shift();
      });
    }
  }

  private _burst(time: number): void {
    const osc = new OscillatorNode(this.context, { type: "sine", frequency: FREQUENCY_HZ });
    const gain = new GainNode(this.context, { gain: 0 });
    osc.connect(gain).connect(this._output);

    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(1, time + ATTACK_SECONDS);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + ATTACK_SECONDS + DECAY_SECONDS);

    osc.start(time);
    osc.stop(time + BURST_SECONDS);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  destroy(): void {
    this._output.disconnect();
    super.destroy();
  }
}
