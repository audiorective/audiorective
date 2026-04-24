import * as THREE from "three";
import { effect } from "alien-signals";
import { attach, PannerAnchor } from "@audiorective/threejs";
import { engine } from "../audio/engine";
import type { Track } from "../audio/trackConfig";

const FLOOR_Y = 0;
const SPHERE_Y = 0.3;
const SPHERE_RADIUS = 0.4;

type TrackEntry = {
  track: Track;
  anchor: PannerAnchor;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
};

export class SpatialScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly entries: TrackEntry[];
  private readonly sphereGeometry: THREE.SphereGeometry;
  private readonly grid: THREE.GridHelper;
  private readonly disposers: Array<() => void> = [];
  private container: HTMLElement | null = null;
  private rafId = 0;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x0a0a0a, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 5, 7);
    this.camera.lookAt(0, 0, 0);

    const listener = new THREE.AudioListener();
    this.camera.add(listener);
    this.scene.add(this.camera);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 8, 4);
    this.scene.add(dir);

    this.grid = new THREE.GridHelper(10, 20, 0x333333, 0x1f1f1f);
    this.grid.position.y = FLOOR_Y;
    this.scene.add(this.grid);

    this.sphereGeometry = new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16);
    this.entries = engine.tracks.map((track, i) => this.buildEntry(track, i));

    this.disposers.push(attach(engine, this.renderer));
    this.disposers.push(this.installPointerHandlers());
    this.disposers.push(
      effect(() => {
        const id = engine.selectedTrackId.$();
        this.syncSelection(id);
      }),
    );
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
    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(container);
    this.disposers.push(() => resizeObserver.disconnect());

    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    for (const d of this.disposers) d();
    this.disposers.length = 0;

    for (const e of this.entries) {
      this.scene.remove(e.anchor);
      e.mesh.material.dispose();
      e.ring.geometry.dispose();
      e.ring.material.dispose();
    }
    this.sphereGeometry.dispose();
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.renderer.dispose();

    const dom = this.renderer.domElement;
    if (this.container && dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
    this.container = null;
  }

  private buildEntry(track: Track, i: number): TrackEntry {
    const color = new THREE.Color(track.color);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(this.sphereGeometry, material);
    mesh.userData["trackId"] = track.id;

    // Bind the track's spatial PannerNode to this scene Object3D so dragging
    // the sphere pans the audio — the only visual→audio coupling in this scene.
    const anchor = new PannerAnchor(track.seq.spatial.panner);
    const x = (i - (engine.tracks.length - 1) / 2) * 1.5;
    anchor.position.set(x, SPHERE_Y, 0);
    anchor.add(mesh);
    this.scene.add(anchor);

    const ringGeometry = new THREE.RingGeometry(SPHERE_RADIUS * 1.2, SPHERE_RADIUS * 1.5, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -SPHERE_Y + 0.01;
    anchor.add(ring);

    return { track, anchor, mesh, ring };
  }

  private syncSelection(id: string): void {
    for (const e of this.entries) {
      const isSelected = e.track.id === id;
      e.mesh.material.emissiveIntensity = isSelected ? 0.9 : 0.35;
      e.ring.material.opacity = isSelected ? 0.75 : 0;
    }
  }

  private installPointerHandlers(): () => void {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SPHERE_Y);
    const hitPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    let dragging: TrackEntry | null = null;

    const setPointerFromEvent = (e: PointerEvent) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerDown = (e: PointerEvent) => {
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, this.camera);
      const meshes = this.entries.map((entry) => entry.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length === 0) return;
      const hitMesh = hits[0]!.object as THREE.Mesh;
      const entry = this.entries.find((x) => x.mesh === hitMesh);
      if (!entry) return;
      dragging = entry;
      this.renderer.domElement.setPointerCapture(e.pointerId);

      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        dragOffset.copy(hitPoint).sub(entry.anchor.position);
      } else {
        dragOffset.set(0, 0, 0);
      }

      if (entry.track.id !== engine.selectedTrackId.value) {
        engine.selectedTrackId.value = entry.track.id;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      setPointerFromEvent(e);
      raycaster.setFromCamera(pointer, this.camera);
      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        dragging.anchor.position.x = hitPoint.x - dragOffset.x;
        dragging.anchor.position.z = hitPoint.z - dragOffset.z;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      this.renderer.domElement.releasePointerCapture(e.pointerId);
      dragging = null;
    };

    const dom = this.renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);

    return () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);
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
