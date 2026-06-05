import type { AppBase, Entity } from "playcanvas";

/**
 * Drives an externally-owned `PannerNode` from a PlayCanvas entity's world
 * transform, once per frame on the app's `update` event. The PlayCanvas
 * counterpart to `@audiorective/threejs`'s `PannerAnchor`.
 *
 * It does **not** own the panner's lifetime — it never disconnects or destroys
 * it. The `Spatial` (or whoever created the panner) owns teardown; this only
 * stops syncing when the returned disposer runs.
 *
 * Convention note: three.js's `getWorldDirection()` returns `+Z`, whereas
 * PlayCanvas's `entity.forward` is `-Z`. Both mean "the way the object faces",
 * so the panner orientation is consistent across renderers.
 */
export function bindPanner(app: AppBase, entity: Entity, panner: PannerNode): () => void {
  const sync = () => {
    const p = entity.getPosition();
    panner.positionX.value = p.x;
    panner.positionY.value = p.y;
    panner.positionZ.value = p.z;
    const f = entity.forward;
    panner.orientationX.value = f.x;
    panner.orientationY.value = f.y;
    panner.orientationZ.value = f.z;
  };
  // Write once eagerly so the panner isn't silent-at-origin until the first frame.
  sync();
  app.on("update", sync);
  return () => app.off("update", sync);
}
