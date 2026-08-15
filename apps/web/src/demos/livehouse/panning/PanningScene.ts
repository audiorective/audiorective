import * as THREE from "three";
import { effect } from "alien-signals";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";

const HALF_W = 7; // room half-width (x)
const HALF_D = 8; // room half-depth (z)
const MIN_Y = 0.2;
const MAX_Y = 4; // room height ceiling for drones
const DOT_R = 0.35;
const SHADOW_R = 0.3;

type Entry = {
  channel: Channel;
  dot: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
};

/**
 * 3D pan controller for the selected drone. Perspective view of the room volume.
 * Drag a drone's floor shadow → x/z (pan + depth); drag its floating dot → y
 * (height). Pure visual three.js (no audio nodes); writes the channel.position cell.
 */
export class PanningScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  private readonly dotGeo = new THREE.SphereGeometry(DOT_R, 20, 12);
  private readonly shadowGeo = new THREE.CircleGeometry(SHADOW_R, 24);
  private readonly entries: Entry[] = [];
  private readonly disposers: Array<() => void> = [];
  private container: HTMLElement | null = null;
  private rafId = 0;

  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x0a0a12, 1);
    this.camera.position.set(0, 7.5, 11);
    this.camera.lookAt(0, 1.2, -2);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(3, 9, 5);
    this.scene.add(dir);
    this.scene.add(new THREE.GridHelper(Math.max(HALF_W, HALF_D) * 2, 16, 0x224455, 0x152033));

    for (const channel of engine.channels) {
      const color = new THREE.Color(channel.color);
      const dot = new THREE.Mesh(this.dotGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
      dot.userData = { channelId: channel.id, kind: "dot" };
      const shadow = new THREE.Mesh(this.shadowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.userData = { channelId: channel.id, kind: "shadow" };
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }),
      );
      this.scene.add(dot, shadow, line);
      this.entries.push({ channel, dot, shadow, line });
    }

    this.disposers.push(this.installPointerHandlers());
    this.disposers.push(effect(() => this.syncSelection(engine.selectedChannelId.$())));
  }

  mount(container: HTMLElement): void {
    this.container = container;
    const dom = this.renderer.domElement;
    dom.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    container.appendChild(dom);
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.disposers.push(() => ro.disconnect());
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      for (const e of this.entries) {
        const p = e.channel.cells.position.value;
        e.dot.position.set(p.x, p.y, p.z);
        e.shadow.position.set(p.x, 0.02, p.z);
        e.line.geometry.setFromPoints([new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, p.y, p.z)]);
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    for (const d of this.disposers.splice(0)) d();
    for (const e of this.entries) {
      e.dot.material.dispose();
      e.shadow.material.dispose();
      e.line.geometry.dispose();
      e.line.material.dispose();
    }
    this.dotGeo.dispose();
    this.shadowGeo.dispose();
    this.renderer.dispose();
    const dom = this.renderer.domElement;
    if (this.container && dom.parentNode === this.container) this.container.removeChild(dom);
    this.container = null;
  }

  private syncSelection(id: string): void {
    for (const e of this.entries) {
      const on = e.channel.id === id;
      e.dot.material.emissiveIntensity = on ? 1.0 : 0.3;
      e.dot.scale.setScalar(on ? 1 : 0.7);
      e.shadow.material.opacity = on ? 0.5 : 0.18;
      e.line.material.opacity = on ? 0.7 : 0.25;
    }
  }

  private installPointerHandlers(): () => void {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const vertPlane = new THREE.Plane();
    const hit = new THREE.Vector3();
    let drag: { entry: Entry; kind: "dot" | "shadow" } | null = null;

    const setPointer = (e: PointerEvent) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };

    const onDown = (e: PointerEvent) => {
      setPointer(e);
      raycaster.setFromCamera(pointer, this.camera);
      const targets = this.entries.flatMap((en) => [en.dot, en.shadow]);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length === 0) return;
      const obj = hits[0]!.object;
      const { channelId, kind } = obj.userData as { channelId: string; kind: "dot" | "shadow" };
      const entry = this.entries.find((en) => en.channel.id === channelId)!;
      drag = { entry, kind };
      this.renderer.domElement.setPointerCapture(e.pointerId);
      if (engine.selectedChannelId.value !== channelId) engine.selectedChannelId.value = channelId;
    };

    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      setPointer(e);
      raycaster.setFromCamera(pointer, this.camera);
      const cur = drag.entry.channel.cells.position.value;
      if (drag.kind === "shadow") {
        if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
        const x = Math.max(-HALF_W, Math.min(HALF_W, hit.x));
        const z = Math.max(-HALF_D, Math.min(HALF_D, hit.z));
        drag.entry.channel.cells.position.value = { x, y: cur.y, z };
      } else {
        // Height: intersect a vertical plane through the dot that faces the camera.
        const n = new THREE.Vector3(this.camera.position.x - cur.x, 0, this.camera.position.z - cur.z).normalize();
        vertPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(cur.x, cur.y, cur.z));
        if (!raycaster.ray.intersectPlane(vertPlane, hit)) return;
        const y = Math.max(MIN_Y, Math.min(MAX_Y, hit.y));
        drag.entry.channel.cells.position.value = { x: cur.x, y, z: cur.z };
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      this.renderer.domElement.releasePointerCapture(e.pointerId);
      drag = null;
    };

    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);
    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
    };
  }

  private resize(): void {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
