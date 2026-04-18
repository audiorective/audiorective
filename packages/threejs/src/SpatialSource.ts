import * as THREE from "three";
import { Param } from "@audiorective/core";
import type { SpatialOptions } from "./types";

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class SpatialSource extends THREE.Object3D {
  readonly panner: PannerNode;
  readonly refDistance: Param<number>;
  readonly maxDistance: Param<number>;
  readonly rolloffFactor: Param<number>;
  readonly distanceModel: Param<DistanceModelType>;
  readonly coneInnerAngle: Param<number>;
  readonly coneOuterAngle: Param<number>;
  readonly coneOuterGain: Param<number>;

  constructor(listener: THREE.AudioListener, options: SpatialOptions = {}) {
    super();

    const ctx = listener.context;
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    this.panner = panner;

    const mkParam = <T>(key: keyof PannerNode, fallback: T): Param<T> => {
      const defaultValue = (options[key as keyof SpatialOptions] as T | undefined) ?? fallback;
      return new Param<T>({
        default: defaultValue,
        bind: {
          set: (v) => {
            (panner as unknown as Record<string, unknown>)[key as string] = v;
          },
        },
      });
    };

    this.refDistance = mkParam<number>("refDistance", 1);
    this.maxDistance = mkParam<number>("maxDistance", 10000);
    this.rolloffFactor = mkParam<number>("rolloffFactor", 1);
    this.distanceModel = mkParam<DistanceModelType>("distanceModel", "inverse");
    this.coneInnerAngle = mkParam<number>("coneInnerAngle", 360);
    this.coneOuterAngle = mkParam<number>("coneOuterAngle", 0);
    this.coneOuterGain = mkParam<number>("coneOuterGain", 0);

    panner.connect(listener.getInput());
  }

  get input(): AudioNode {
    return this.panner;
  }

  override updateMatrixWorld(force?: boolean): void {
    super.updateMatrixWorld(force);
    this.getWorldPosition(_pos);
    this.getWorldDirection(_dir);

    const p = this.panner;
    p.positionX.value = _pos.x;
    p.positionY.value = _pos.y;
    p.positionZ.value = _pos.z;
    p.orientationX.value = _dir.x;
    p.orientationY.value = _dir.y;
    p.orientationZ.value = _dir.z;
  }

  destroy(): void {
    this.panner.disconnect();
    this.refDistance.destroy();
    this.maxDistance.destroy();
    this.rolloffFactor.destroy();
    this.distanceModel.destroy();
    this.coneInnerAngle.destroy();
    this.coneOuterAngle.destroy();
    this.coneOuterGain.destroy();
  }
}
