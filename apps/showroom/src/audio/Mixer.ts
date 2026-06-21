import { AudioProcessor } from "@audiorective/core";
import type { Param, SchedulableParam, Cell } from "@audiorective/core";
import { Channel } from "./Channel";
import { createReverb } from "./reverb";
import { rms } from "./meterMath";

const BUS_RAMP_S = 0.02;

/**
 * Sums channels into a room bus (+ convolver reverb) and a headphone bus, and the
 * global `headphone` toggle picks which is audible. Owns solo/mute resolution and a
 * single metering RAF loop that writes every channel's `level` cell.
 */
export class Mixer extends AudioProcessor<{ headphone: Param<boolean>; masterVolume: SchedulableParam }, { masterLevel: Cell<number> }> {
  readonly channels: Channel[];

  private readonly _roomBus: GainNode;
  private readonly _phonesBus: GainNode;
  private readonly _master: GainNode;
  private readonly _masterAnalyser: AnalyserNode;
  private readonly _buf: Float32Array;
  private _rafId: number | null = null;

  constructor(ctx: AudioContext, channels: Channel[]) {
    const master = new GainNode(ctx, { gain: 0.9 });
    super(ctx, ({ param, cell }) => ({
      params: {
        headphone: param<boolean>({ default: false }),
        masterVolume: param({ default: 0.9, min: 0, max: 1, bind: master.gain }),
      },
      cells: { masterLevel: cell<number>(0) },
    }));

    this.channels = channels;
    this._master = master;
    this._roomBus = new GainNode(ctx, { gain: 1 });
    this._phonesBus = new GainNode(ctx, { gain: 0 });
    this._masterAnalyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.6 });
    this._buf = new Float32Array(this._masterAnalyser.fftSize);

    const { convolver, wet, dry } = createReverb(ctx);
    this._roomBus.connect(dry).connect(this._master);
    this._roomBus.connect(convolver).connect(wet).connect(this._master);
    this._phonesBus.connect(this._master);
    this._master.connect(this._masterAnalyser);
    this._masterAnalyser.connect(ctx.destination);

    for (const ch of channels) {
      ch.roomOut.connect(this._roomBus);
      ch.phonesOut.connect(this._phonesBus);
    }

    // headphone routing (runs once at construction → in-room default)
    this.effect(() => {
      const phones = this.params.headphone.value;
      const now = ctx.currentTime;
      this._ramp(this._roomBus.gain, phones ? 0 : 1, now);
      this._ramp(this._phonesBus.gain, phones ? 1 : 0, now);
    });

    // solo/mute resolution across all channels
    this.effect(() => {
      const anySolo = this.channels.some((c) => c.params.soloed.value);
      for (const c of this.channels) {
        const audible = anySolo ? c.params.soloed.value : !c.params.muted.value;
        c.applyMix(audible);
      }
    });
  }

  get output(): AudioNode {
    return this._master;
  }

  get roomBusGain(): number {
    return this._roomBus.gain.value;
  }

  get phonesBusGain(): number {
    return this._phonesBus.gain.value;
  }

  startMetering(): void {
    if (this._rafId !== null) return;
    const tick = () => {
      for (const c of this.channels) {
        c.analyser.getFloatTimeDomainData(this._buf);
        c.cells.level.value = rms(this._buf);
      }
      this._masterAnalyser.getFloatTimeDomainData(this._buf);
      this.cells.masterLevel.value = rms(this._buf);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stopMetering(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  private _ramp(p: AudioParam, target: number, now: number): void {
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.linearRampToValueAtTime(target, now + BUS_RAMP_S);
  }

  override destroy(): void {
    this.stopMetering();
    super.destroy();
    for (const c of this.channels) c.destroy();
    this._roomBus.disconnect();
    this._phonesBus.disconnect();
    this._master.disconnect();
    this._masterAnalyser.disconnect();
  }
}
