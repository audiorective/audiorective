import * as THREE from "three";
import { effect } from "alien-signals";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";
import type { SchedulableParam } from "@audiorective/core";

const GAIN_MIN = -12;
const GAIN_MAX = 12;
const HALF_W = 3; // ortho half-width
const HALF_H = 2; // ortho half-height (maps to ±12 dB)
const BAND_X = [-2, 0, 2];

function gainToY(db: number): number {
  return (db / GAIN_MAX) * HALF_H;
}
function yToGain(y: number): number {
  return Math.max(GAIN_MIN, Math.min(GAIN_MAX, (y / HALF_H) * GAIN_MAX));
}

/** Drag three band nodes to set the selected channel's EQ gains. */
export class EqScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, HALF_H, -HALF_H, 0.1, 10);
  private readonly nodes: THREE.Mesh[] = [];
  private readonly line: THREE.Line;
  private readonly disposers: Array<() => void> = [];
  private container: HTMLElement | null = null;
  private rafId = 0;
  private current: Channel = engine.channels[0];

  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x0c0c16, 1);
    this.camera.position.z = 5;

    const geo = new THREE.SphereGeometry(0.16, 16, 12);
    const mat = () => new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, mat());
      m.position.set(BAND_X[i], 0, 0);
      this.scene.add(m);
      this.nodes.push(m);
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(BAND_X.map((x) => new THREE.Vector3(x, 0, 0)));
    this.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x22d3ee }));
    this.scene.add(this.line);

    this.disposers.push(this.installPointerHandlers());
    this.disposers.push(effect(() => this.bindChannel(engine.selectedChannelId.$())));
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
      this.syncNodesFromParams();
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    for (const d of this.disposers.splice(0)) d();
    this.renderer.dispose();
    const dom = this.renderer.domElement;
    if (this.container && dom.parentNode === this.container) this.container.removeChild(dom);
    this.container = null;
  }

  private bands(): SchedulableParam[] {
    return [this.current.eq.params.eqLow, this.current.eq.params.eqMid, this.current.eq.params.eqHigh];
  }

  private bindChannel(id: string): void {
    this.current = engine.channels.find((c) => c.id === id) ?? engine.channels[0];
  }

  private syncNodesFromParams(): void {
    const b = this.bands();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const y = gainToY(b[i].value);
      this.nodes[i].position.y = y;
      pts.push(new THREE.Vector3(BAND_X[i], y, 0));
    }
    this.line.geometry.setFromPoints(pts);
  }

  private installPointerHandlers(): () => void {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    let dragIdx = -1;

    const setPointer = (e: PointerEvent) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };
    const onDown = (e: PointerEvent) => {
      setPointer(e);
      raycaster.setFromCamera(pointer, this.camera);
      const hits = raycaster.intersectObjects(this.nodes, false);
      if (hits.length === 0) return;
      dragIdx = this.nodes.indexOf(hits[0]!.object as THREE.Mesh);
      this.renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (dragIdx < 0) return;
      setPointer(e);
      raycaster.setFromCamera(pointer, this.camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      this.bands()[dragIdx].value = yToGain(hit.y);
    };
    const onUp = (e: PointerEvent) => {
      if (dragIdx < 0) return;
      this.renderer.domElement.releasePointerCapture(e.pointerId);
      dragIdx = -1;
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
  }
}
