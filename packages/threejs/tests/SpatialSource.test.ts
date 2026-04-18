import { describe, test, expect } from "vitest";
import * as THREE from "three";
import { SpatialSource } from "../src";

function makeListener(): THREE.AudioListener {
  const ctx = new AudioContext();
  THREE.AudioContext.setContext(ctx);
  return new THREE.AudioListener();
}

describe("SpatialSource", () => {
  test("is an Object3D and wraps a PannerNode", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    expect(s).toBeInstanceOf(THREE.Object3D);
    expect(s.panner).toBeInstanceOf(PannerNode);
    s.destroy();
  });

  test("input returns the panner", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    expect(s.input).toBe(s.panner);
    s.destroy();
  });

  test("applies defaults from options to PannerNode", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener, {
      distanceModel: "linear",
      refDistance: 2,
      maxDistance: 500,
      rolloffFactor: 1.5,
      coneInnerAngle: 120,
      coneOuterAngle: 240,
      coneOuterGain: 0.25,
    });
    expect(s.panner.distanceModel).toBe("linear");
    expect(s.panner.refDistance).toBe(2);
    expect(s.panner.maxDistance).toBe(500);
    expect(s.panner.rolloffFactor).toBe(1.5);
    expect(s.panner.coneInnerAngle).toBe(120);
    expect(s.panner.coneOuterAngle).toBe(240);
    expect(s.panner.coneOuterGain).toBe(0.25);
    s.destroy();
  });

  test("reactive params propagate to PannerNode", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    s.refDistance.value = 5;
    s.maxDistance.value = 777;
    s.rolloffFactor.value = 3;
    s.distanceModel.value = "exponential";
    s.coneInnerAngle.value = 45;
    s.coneOuterAngle.value = 90;
    s.coneOuterGain.value = 0.1;
    expect(s.panner.refDistance).toBe(5);
    expect(s.panner.maxDistance).toBe(777);
    expect(s.panner.rolloffFactor).toBe(3);
    expect(s.panner.distanceModel).toBe("exponential");
    expect(s.panner.coneInnerAngle).toBe(45);
    expect(s.panner.coneOuterAngle).toBe(90);
    expect(s.panner.coneOuterGain).toBeCloseTo(0.1);
    s.destroy();
  });

  test("updateMatrixWorld syncs world position to the panner", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    s.position.set(3, -4, 5);
    s.updateMatrixWorld(true);
    expect(s.panner.positionX.value).toBeCloseTo(3);
    expect(s.panner.positionY.value).toBeCloseTo(-4);
    expect(s.panner.positionZ.value).toBeCloseTo(5);
    s.destroy();
  });

  test("updateMatrixWorld syncs world orientation (+Z forward) to the panner", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    s.updateMatrixWorld(true);
    expect(s.panner.orientationX.value).toBeCloseTo(0);
    expect(s.panner.orientationY.value).toBeCloseTo(0);
    expect(s.panner.orientationZ.value).toBeCloseTo(1);
    s.destroy();
  });

  test("parent transform composes into world position", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    const parent = new THREE.Object3D();
    parent.position.set(10, 0, 0);
    parent.add(s);
    s.position.set(0, 0, 5);
    parent.updateMatrixWorld(true);
    expect(s.panner.positionX.value).toBeCloseTo(10);
    expect(s.panner.positionZ.value).toBeCloseTo(5);
    s.destroy();
  });

  test("destroy disconnects panner and cleans up params", () => {
    const listener = makeListener();
    const s = new SpatialSource(listener);
    s.refDistance.value = 7;
    expect(s.panner.refDistance).toBe(7);
    s.destroy();
    // After destroy, param's bind effect should no longer propagate.
    s.refDistance.value = 99;
    expect(s.panner.refDistance).toBe(7);
  });
});
