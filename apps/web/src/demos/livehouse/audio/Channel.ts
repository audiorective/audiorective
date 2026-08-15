import { AudioProcessor, Spatial } from "@audiorective/core";
import type { Param, SchedulableParam, Cell, SpatialOptions } from "@audiorective/core";
import { EQ3 } from "../shared/audio/EQ3";
import { azimuthToPan, type Vec3 } from "./spatialMath";

/** Anything that produces audio: FilePlayer, Sampler/BufferPlayer-backed source, synth, etc. */
export interface SourceLike {
  readonly output: AudioNode | undefined;
  destroy?: () => void;
}

export interface ChannelOptions {
  id: string;
  label: string;
  color: string;
  source: SourceLike;
  position: Vec3;
  spatial?: SpatialOptions;
}

const MUTE_RAMP_S = 0.015;

/**
 * Source-agnostic channel strip: source → EQ3 → fader → mute → analyser, then a
 * room path (Spatial HRTF) and a headphone path (StereoPanner from position).
 */
export class Channel extends AudioProcessor<
  { volume: SchedulableParam; muted: Param<boolean>; soloed: Param<boolean> },
  { position: Cell<Vec3>; level: Cell<number> }
> {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly eq: EQ3;
  readonly spatial: Spatial;
  readonly analyser: AnalyserNode;

  private readonly _source: SourceLike;
  private readonly _fader: GainNode;
  private readonly _mute: GainNode;
  private readonly _stereo: StereoPannerNode;

  constructor(ctx: AudioContext, opts: ChannelOptions) {
    const fader = new GainNode(ctx, { gain: 0.8 });
    super(ctx, ({ param, cell }) => ({
      params: {
        volume: param({ default: 0.8, min: 0, max: 1, bind: fader.gain }),
        muted: param<boolean>({ default: false }),
        soloed: param<boolean>({ default: false }),
      },
      cells: {
        position: cell<Vec3>(opts.position),
        level: cell<number>(0),
      },
    }));

    this.id = opts.id;
    this.label = opts.label;
    this.color = opts.color;
    this._source = opts.source;
    this._fader = fader;

    this.eq = new EQ3(ctx);
    this.spatial = new Spatial(ctx, opts.spatial);
    this.analyser = new AnalyserNode(ctx, { fftSize: 1024, smoothingTimeConstant: 0.6 });
    this._mute = new GainNode(ctx, { gain: 1 });
    this._stereo = new StereoPannerNode(ctx, { pan: azimuthToPan(opts.position) });

    opts.source.output?.connect(this.eq.input);
    this.eq.output.connect(this._fader);
    this._fader.connect(this._mute);
    this._mute.connect(this.analyser);
    this.analyser.connect(this.spatial.input);
    this.analyser.connect(this._stereo);

    // position cell → headphone stereo pan (cleaned up by super.destroy()).
    this.effect(() => {
      this._stereo.pan.value = azimuthToPan(this.cells.position.value);
    });
  }

  /** The strip splits into two buses; there is no single output. */
  get output(): AudioNode | undefined {
    return undefined;
  }

  get roomOut(): AudioNode {
    return this.spatial.output;
  }

  /**
   * Pre-panner reverb send (post EQ/fader/mute, before the Spatial distance stage).
   * Distance-independent on purpose: feeding the room reverb from here keeps the wet
   * level constant as the listener moves, so the wet/dry ratio rises with distance.
   */
  get auxOut(): AudioNode {
    return this.analyser;
  }

  get phonesOut(): AudioNode {
    return this._stereo;
  }

  /** Live mute-gain value — for tests/metering, not reactive. */
  get muteGainValue(): number {
    return this._mute.gain.value;
  }

  /** Set by the Mixer's solo/mute resolution. Ramps to avoid clicks. */
  applyMix(audible: boolean): void {
    const now = this.context.currentTime;
    const g = this._mute.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(audible ? 1 : 0, now + MUTE_RAMP_S);
  }

  override destroy(): void {
    super.destroy();
    this._source.destroy?.();
    this.eq.destroy();
    this.spatial.destroy();
    this._fader.disconnect();
    this._mute.disconnect();
    this.analyser.disconnect();
    this._stereo.disconnect();
  }
}
