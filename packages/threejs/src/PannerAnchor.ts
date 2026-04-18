import * as THREE from "three";

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class PannerAnchor extends THREE.Object3D {
  readonly panner: PannerNode;

  constructor(panner: PannerNode) {
    super();
    this.panner = panner;
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
}
