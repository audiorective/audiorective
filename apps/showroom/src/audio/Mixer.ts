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
  private readonly _auxBus: GainNode;
  private readonly _phonesBus: GainNode;
  private readonly _master: GainNode;
  private readonly _masterAnalyser: AnalyserNode;
  private readonly _convolver: ConvolverNode;
  private readonly _wet: GainNode;
  // Typed as <ArrayBuffer> (not the default <ArrayBufferLike>) so AnalyserNode's
  // getFloatTimeDomainData accepts it under TS's strict typed-array generics.
  private readonly _buf: Float32Array<ArrayBuffer>;
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
    this._auxBus = new GainNode(ctx, { gain: 1 });
    this._phonesBus = new GainNode(ctx, { gain: 0 });
    this._masterAnalyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.6 });
    this._buf = new Float32Array(new ArrayBuffer(this._masterAnalyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

    // The dry/direct in-room sound is the distance-attenuated room bus straight to master.
    // The reverb is an AUX SEND fed PRE-panner (auxBus), so its level is distance-independent —
    // moving away drops the dry while the wet holds, so the wet/dry ratio rises with distance.
    const { convolver, wet } = createReverb(ctx, { wet: 0.12 });
    this._convolver = convolver;
    this._wet = wet;
    this._roomBus.connect(this._master);
    this._auxBus.connect(convolver).connect(wet).connect(this._master);
    this._phonesBus.connect(this._master);
    this._master.connect(this._masterAnalyser);
    this._masterAnalyser.connect(ctx.destination);

    for (const ch of channels) {
      ch.roomOut.connect(this._roomBus); // dry, post-panner (distance-attenuated)
      ch.auxOut.connect(this._auxBus); // reverb send, pre-panner (distance-independent)
      ch.phonesOut.connect(this._phonesBus);
    }

    // headphone routing (runs once at construction → in-room default). Headphone is fully
    // dry: it mutes the room (dry) AND the aux (reverb), leaving only the phones bus.
    this.effect(() => {
      const phones = this.params.headphone.value;
      const now = ctx.currentTime;
      this._ramp(this._roomBus.gain, phones ? 0 : 1, now);
      this._ramp(this._auxBus.gain, phones ? 0 : 1, now);
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

  get auxBusGain(): number {
    return this._auxBus.gain.value;
  }

  /** Swap the room reverb's impulse response (e.g. a user-provided IR from config). */
  setReverbBuffer(buffer: AudioBuffer): void {
    this._convolver.buffer = buffer;
  }

  /** Reverb send amount (wet gain, 0..1). */
  setReverbWet(value: number): void {
    this._wet.gain.value = Math.max(0, value);
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
    this._auxBus.disconnect();
    this._phonesBus.disconnect();
    this._master.disconnect();
    this._masterAnalyser.disconnect();
  }
}
