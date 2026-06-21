import * as THREE from "three";
import { effect } from "alien-signals";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";

const HALF_W = 7; // matches LivehouseScene room half-width
const HALF_D = 8;
const DOT_R = 0.35;

type Entry = { channel: Channel; mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> };

/** Top-down 3D-ish pan controller. Drag the selected drone's dot → writes channel.position. */
export class PanningScene {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  private readonly geo = new THREE.SphereGeometry(DOT_R, 20, 12);
  private readonly entries: Entry[] = [];
  private readonly disposers: Array<() => void> = [];
  private container: HTMLElement | null = null;
  private rafId = 0;

  constructor() {
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x0a0a12, 1);
    this.camera.position.set(0, 13, 0.001);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(2, 8, 3);
    this.scene.add(dir);
    this.scene.add(new THREE.GridHelper(Math.max(HALF_W, HALF_D) * 2, 16, 0x224455, 0x152033));

    // Listener marker at origin (visual only).
    const lis = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial({ color: 0xeab308 }));
    this.scene.add(lis);

    for (const channel of engine.channels) {
      const color = new THREE.Color(channel.color);
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
      this.scene.add(mesh);
      this.entries.push({ channel, mesh });
    }

    this.disposers.push(this.installPointerHandlers());
    this.disposers.push(effect(() => this.syncSelection(engine.selectedChannelId.$())));
  }

  mount(container: HTMLElement): void {
    this.container = container;
    const dom = this.renderer.domElement;
    dom.style.display = "block";
    dom.style.width = "100%";
    dom.style.height = "100%";
    dom.style.touchAction = "none";
    container.appendChild(dom);
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.disposers.push(() => ro.disconnect());
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      // Place dots from the position cells every frame (cheap, keeps in sync with walking/drag).
      for (const e of this.entries) {
        const p = e.channel.cells.position.value;
        e.mesh.position.set(p.x, 0, p.z);
      }
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    for (const d of this.disposers.splice(0)) d();
    for (const e of this.entries) e.mesh.material.dispose();
    this.geo.dispose();
    this.renderer.dispose();
    const dom = this.renderer.domElement;
    if (this.container && dom.parentNode === this.container) this.container.removeChild(dom);
    this.container = null;
  }

  private syncSelection(id: string): void {
    for (const e of this.entries) {
      e.mesh.material.emissiveIntensity = e.channel.id === id ? 1.0 : 0.35;
    }
  }

  private installPointerHandlers(): () => void {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let dragging: Entry | null = null;

    const setPointer = (e: PointerEvent) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    };

    const onDown = (e: PointerEvent) => {
      setPointer(e);
      raycaster.setFromCamera(pointer, this.camera);
      const hits = raycaster.intersectObjects(
        this.entries.map((x) => x.mesh),
        false,
      );
      if (hits.length === 0) return;
      const entry = this.entries.find((x) => x.mesh === hits[0]!.object)!;
      dragging = entry;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      if (engine.selectedChannelId.value !== entry.channel.id) engine.selectedChannelId.value = entry.channel.id;
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      setPointer(e);
      raycaster.setFromCamera(pointer, this.camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;
      const x = Math.max(-HALF_W, Math.min(HALF_W, hit.x));
      const z = Math.max(-HALF_D, Math.min(HALF_D, hit.z));
      const cur = dragging.channel.cells.position.value;
      dragging.channel.cells.position.value = { x, y: cur.y, z };
    };

    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      this.renderer.domElement.releasePointerCapture(e.pointerId);
      dragging = null;
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
