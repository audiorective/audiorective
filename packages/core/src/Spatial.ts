import { AudioProcessor } from "./AudioProcessor";
import type { Param } from "./Param";

export interface SpatialOptions {
  distanceModel?: DistanceModelType;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  coneInnerAngle?: number;
  coneOuterAngle?: number;
  coneOuterGain?: number;
}

type SpatialParams = {
  refDistance: Param<number>;
  maxDistance: Param<number>;
  rolloffFactor: Param<number>;
  distanceModel: Param<DistanceModelType>;
  coneInnerAngle: Param<number>;
  coneOuterAngle: Param<number>;
  coneOuterGain: Param<number>;
};

export class Spatial extends AudioProcessor<SpatialParams> {
  readonly panner: PannerNode;
  readonly input: GainNode;

  constructor(context: AudioContext, options: SpatialOptions = {}) {
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    const input = new GainNode(context);
    input.connect(panner);

    const setField = <K extends keyof PannerNode>(key: K) => ({
      set: (v: PannerNode[K]) => {
        panner[key] = v;
      },
    });

    super(context, ({ param }) => ({
      params: {
        refDistance: param<number>({ default: options.refDistance ?? 1, label: "Ref Distance", min: 0, bind: setField("refDistance") }),
        maxDistance: param<number>({ default: options.maxDistance ?? 10000, label: "Max Distance", min: 0, bind: setField("maxDistance") }),
        rolloffFactor: param<number>({ default: options.rolloffFactor ?? 1, label: "Rolloff", min: 0, bind: setField("rolloffFactor") }),
        distanceModel: param<DistanceModelType>({
          default: options.distanceModel ?? "inverse",
          label: "Distance Model",
          bind: setField("distanceModel"),
        }),
        coneInnerAngle: param<number>({
          default: options.coneInnerAngle ?? 360,
          label: "Cone Inner",
          min: 0,
          max: 360,
          bind: setField("coneInnerAngle"),
        }),
        coneOuterAngle: param<number>({
          default: options.coneOuterAngle ?? 0,
          label: "Cone Outer",
          min: 0,
          max: 360,
          bind: setField("coneOuterAngle"),
        }),
        coneOuterGain: param<number>({
          default: options.coneOuterGain ?? 0,
          label: "Cone Outer Gain",
          min: 0,
          max: 1,
          bind: setField("coneOuterGain"),
        }),
      },
    }));

    this.panner = panner;
    this.input = input;
  }

  get output(): AudioNode {
    return this.panner;
  }

  override destroy(): void {
    super.destroy();
    this.input.disconnect();
    this.panner.disconnect();
  }
}
