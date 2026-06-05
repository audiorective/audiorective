import { describe, test, expect, beforeAll, afterAll } from "vitest";
import * as pc from "playcanvas";
import { bindPanner } from "../src";

function makeApp(): pc.Application {
  const canvas = document.createElement("canvas");
  return new pc.Application(canvas, {});
}

function makePanner(ctx: AudioContext): PannerNode {
  return ctx.createPanner();
}

describe("bindPanner", () => {
  let app: pc.Application;
  let ctx: AudioContext;

  beforeAll(() => {
    app = makeApp();
    ctx = new AudioContext();
  });

  afterAll(() => {
    app.destroy();
  });

  test("writes the entity's world position to the panner on the first frame", () => {
    const entity = new pc.Entity("emitter");
    entity.setPosition(3, -4, 5);
    app.root.addChild(entity);
    const panner = makePanner(ctx);

    const dispose = bindPanner(app, entity, panner);
    // bindPanner syncs once eagerly — no app.fire needed for the initial write.
    expect(panner.positionX.value).toBeCloseTo(3);
    expect(panner.positionY.value).toBeCloseTo(-4);
    expect(panner.positionZ.value).toBeCloseTo(5);
    dispose();
  });

  test("writes the entity's -Z forward as the panner orientation", () => {
    const entity = new pc.Entity("emitter");
    app.root.addChild(entity);
    const panner = makePanner(ctx);

    const dispose = bindPanner(app, entity, panner);
    // Default entity faces -Z.
    expect(panner.orientationX.value).toBeCloseTo(0);
    expect(panner.orientationY.value).toBeCloseTo(0);
    expect(panner.orientationZ.value).toBeCloseTo(-1);
    dispose();
  });

  test("re-syncs on each update event as the entity moves", () => {
    const entity = new pc.Entity("emitter");
    app.root.addChild(entity);
    const panner = makePanner(ctx);

    const dispose = bindPanner(app, entity, panner);
    entity.setPosition(1, 2, 3);
    app.fire("update", 0.016);
    expect(panner.positionX.value).toBeCloseTo(1);
    expect(panner.positionY.value).toBeCloseTo(2);
    expect(panner.positionZ.value).toBeCloseTo(3);
    dispose();
  });

  test("composes parent transforms into the panner's world position", () => {
    const parent = new pc.Entity("parent");
    parent.setPosition(10, 0, 0);
    const child = new pc.Entity("child");
    child.setLocalPosition(0, 0, 5);
    parent.addChild(child);
    app.root.addChild(parent);
    const panner = makePanner(ctx);

    const dispose = bindPanner(app, child, panner);
    expect(panner.positionX.value).toBeCloseTo(10);
    expect(panner.positionZ.value).toBeCloseTo(5);
    dispose();
  });

  test("disposer unhooks the update listener — no more sync after dispose", () => {
    const entity = new pc.Entity("emitter");
    app.root.addChild(entity);
    const panner = makePanner(ctx);

    const dispose = bindPanner(app, entity, panner);
    dispose();
    entity.setPosition(99, 99, 99);
    app.fire("update", 0.016);
    expect(panner.positionX.value).not.toBeCloseTo(99);
  });

  test("does not own the panner — dispose never disconnects it", () => {
    const entity = new pc.Entity("emitter");
    app.root.addChild(entity);
    const panner = makePanner(ctx);
    let disconnected = false;
    const originalDisconnect = panner.disconnect.bind(panner);
    panner.disconnect = ((...args: unknown[]) => {
      disconnected = true;
      return (originalDisconnect as (...a: unknown[]) => void)(...args);
    }) as typeof panner.disconnect;

    const dispose = bindPanner(app, entity, panner);
    dispose();
    expect(disconnected).toBe(false);
  });
});
