import { describe, test, expect, vi } from "vitest";
import * as THREE from "three";
import { PannerAnchor } from "../src";

function makePanner(): PannerNode {
  const ctx = new AudioContext();
  return ctx.createPanner();
}

describe("PannerAnchor", () => {
  test("is an Object3D and holds the passed-in panner", () => {
    const panner = makePanner();
    const anchor = new PannerAnchor(panner);
    expect(anchor).toBeInstanceOf(THREE.Object3D);
    expect(anchor.panner).toBe(panner);
  });

  test("updateMatrixWorld syncs world position to the panner", () => {
    const panner = makePanner();
    const anchor = new PannerAnchor(panner);
    anchor.position.set(3, -4, 5);
    anchor.updateMatrixWorld(true);
    expect(panner.positionX.value).toBeCloseTo(3);
    expect(panner.positionY.value).toBeCloseTo(-4);
    expect(panner.positionZ.value).toBeCloseTo(5);
  });

  test("updateMatrixWorld syncs +Z forward orientation to the panner", () => {
    const panner = makePanner();
    const anchor = new PannerAnchor(panner);
    anchor.updateMatrixWorld(true);
    expect(panner.orientationX.value).toBeCloseTo(0);
    expect(panner.orientationY.value).toBeCloseTo(0);
    expect(panner.orientationZ.value).toBeCloseTo(1);
  });

  test("parent transform composes into the panner's world position", () => {
    const panner = makePanner();
    const anchor = new PannerAnchor(panner);
    const parent = new THREE.Object3D();
    parent.position.set(10, 0, 0);
    parent.add(anchor);
    anchor.position.set(0, 0, 5);
    parent.updateMatrixWorld(true);
    expect(panner.positionX.value).toBeCloseTo(10);
    expect(panner.positionZ.value).toBeCloseTo(5);
  });

  test("reparenting updates panner position on next updateMatrixWorld", () => {
    const panner = makePanner();
    const anchor = new PannerAnchor(panner);
    const a = new THREE.Object3D();
    a.position.set(1, 0, 0);
    const b = new THREE.Object3D();
    b.position.set(-5, 0, 0);
    a.add(anchor);
    a.updateMatrixWorld(true);
    expect(panner.positionX.value).toBeCloseTo(1);
    a.remove(anchor);
    b.add(anchor);
    b.updateMatrixWorld(true);
    expect(panner.positionX.value).toBeCloseTo(-5);
  });

  test("removing the anchor from a parent does not disconnect the panner", () => {
    const panner = makePanner();
    const disconnectSpy = vi.spyOn(panner, "disconnect");
    const anchor = new PannerAnchor(panner);
    const parent = new THREE.Object3D();
    parent.add(anchor);
    parent.remove(anchor);
    expect(disconnectSpy).not.toHaveBeenCalled();
    disconnectSpy.mockRestore();
  });
});
