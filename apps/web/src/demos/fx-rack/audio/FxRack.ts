import { AudioProcessor, BufferPlayer, Sampler, type Cell, type GraphHandle } from "@audiorective/core";
import {
  Channel,
  Compressor,
  Convolver,
  Distortion,
  Filter,
  FrequencyShifter,
  Limiter,
  Phaser,
  PingPongDelay,
  PitchShift,
  SendBus,
  type PitchShiftEngine,
  type Send,
} from "@audiorective/effects";
import type { DrumKit, DrumVoiceId } from "../../sequencer/audio/drumKit";
import { makeImpulseResponse } from "./impulseResponse";
export { makeImpulseResponse };

export type InsertKey = "pitchShift" | "filter" | "frequencyShifter" | "distortion" | "phaser";
export type SendKey = "delay" | "reverb";
export interface FxRackOptions {
  loop?: AudioBuffer | null;
  kit: DrumKit;
  pitchEngine?: PitchShiftEngine;
}

/**
 * Headless FX-rack processor: every pad and the loop deck feed one insert
 * chain (pitch shift, filter, frequency shifter, distortion, phaser) into a
 * compressor and limiter, plus two sends (delay, reverb) that rejoin before
 * the compressor. Shared by the live demo and the offline export — no DOM.
 */
export class FxRack extends AudioProcessor<{}, { isReady: Cell<boolean> }> {
  readonly channel: Channel;
  readonly bus: SendBus;
  readonly inserts: { pitchShift: PitchShift; filter: Filter; frequencyShifter: FrequencyShifter; distortion: Distortion; phaser: Phaser };
  readonly sends: { delay: { effect: PingPongDelay; send: Send }; reverb: { effect: Convolver; send: Send } };
  readonly compressor: Compressor;
  readonly limiter: Limiter;
  readonly deck: BufferPlayer;
  readonly pads: Record<DrumVoiceId, Sampler>;
  readonly graph: GraphHandle;
  readonly ready: Promise<void>;
  private readonly out: GainNode;

  constructor(ctx: BaseAudioContext, opts: FxRackOptions) {
    const out = new GainNode(ctx);
    super(ctx, ({ cell }) => ({ params: {}, cells: { isReady: cell(false) } }));
    this.out = out;

    this.channel = new Channel(ctx);
    this.bus = new SendBus(ctx);
    this.bus.define("delay");
    this.bus.define("reverb");
    this.inserts = {
      pitchShift: new PitchShift(ctx, { engine: opts.pitchEngine ?? "granular", windowSize: 0.03, stretch: { blockMs: 40 } }),
      filter: new Filter(ctx, { frequency: 15000, type: "lowpass", rolloff: -24 }),
      frequencyShifter: new FrequencyShifter(ctx, { wet: 0 }),
      distortion: new Distortion(ctx, { distortion: 0.5, wet: 0 }),
      phaser: new Phaser(ctx, { frequency: 0.5, baseFrequency: 100, octaves: 3, wet: 0 }),
    };
    const delay = new PingPongDelay(ctx, { delayTime: 0.375, feedback: 0.35 });
    const reverb = new Convolver(ctx, { buffer: makeImpulseResponse(ctx) });
    this.sends = {
      delay: { effect: delay, send: this.channel.send(this.bus, "delay", 0) },
      reverb: { effect: reverb, send: this.channel.send(this.bus, "reverb", 0) },
    };
    this.compressor = new Compressor(ctx, { threshold: -18, ratio: 3, wet: 1 });
    this.limiter = new Limiter(ctx, { threshold: -1 });
    this.deck = new BufferPlayer(ctx, { loop: true, buffer: opts.loop ?? undefined });
    // offline export schedules a whole bar up front, so voices must not steal each other
    this.pads = {
      kick: new Sampler(ctx, { buffer: opts.kit.kick, polyphony: 32 }),
      snare: new Sampler(ctx, { buffer: opts.kit.snare, polyphony: 32 }),
      hat: new Sampler(ctx, { buffer: opts.kit.hat, polyphony: 32 }),
      clap: new Sampler(ctx, { buffer: opts.kit.clap, polyphony: 32 }),
    };

    const { pitchShift, filter, frequencyShifter, distortion, phaser } = this.inserts;
    this.graph = this.defineGraph(
      () => [
        [this.deck, this.channel],
        [this.pads.kick, this.channel],
        [this.pads.snare, this.channel],
        [this.pads.hat, this.channel],
        [this.pads.clap, this.channel],
        [this.channel, pitchShift],
        [pitchShift, filter],
        [filter, frequencyShifter],
        [frequencyShifter, distortion],
        [distortion, phaser],
        [phaser, this.compressor],
        [this.bus.receive("delay"), delay],
        [delay, this.compressor],
        [this.bus.receive("reverb"), reverb],
        [reverb, this.compressor],
        [this.compressor, this.limiter],
        [this.limiter, out],
      ],
      { compensate: true },
    );

    this.ready = Promise.all([pitchShift.ready, this.compressor.ready, this.limiter.ready, reverb.ready]).then(() => {
      this.cells.isReady.value = true;
    });
  }

  get output(): GainNode {
    return this.out;
  }

  play(when = this.context.currentTime): void {
    this.deck.start(when);
  }
  stop(): void {
    this.deck.stop();
  }
  hit(pad: DrumVoiceId, when?: number): void {
    this.pads[pad].trigger({ when });
  }

  /** Kick on 1 and 3, snare on 2 and 4, hats on every 8th — the export pattern. */
  scheduleBars(bars: number, bpm: number, from = 0): void {
    const beat = 60 / bpm;
    for (let bar = 0; bar < bars; bar++) {
      const t0 = from + bar * 4 * beat;
      this.hit("kick", t0);
      this.hit("kick", t0 + 2 * beat);
      this.hit("snare", t0 + beat);
      this.hit("snare", t0 + 3 * beat);
      for (let e = 0; e < 8; e++) this.hit("hat", t0 + (e * beat) / 2);
    }
  }

  override destroy(): void {
    this.deck.destroy();
    for (const p of Object.values(this.pads)) p.destroy();
    for (const fx of Object.values(this.inserts)) fx.destroy();
    this.sends.delay.effect.destroy();
    this.sends.reverb.effect.destroy();
    this.compressor.destroy();
    this.limiter.destroy();
    this.channel.destroy();
    this.bus.destroy();
    super.destroy();
  }
}
