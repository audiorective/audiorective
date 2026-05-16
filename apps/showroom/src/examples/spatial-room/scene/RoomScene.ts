import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { effect } from "alien-signals";
import { attach, PannerAnchor } from "@audiorective/threejs";
import { engine } from "../audio/engine";

const ROOM_W = 10;
const ROOM_H = 3;
const ROOM_D = 10;
const WALL_MARGIN = 0.3;
const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.0; // m/s
const DAMPING = 8.0;

type KeyState = { w: boolean; a: boolean; s: boolean; d: boolean };

export class RoomScene {
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly listener: THREE.AudioListener;
  private readonly controls: PointerLockControls;
  private readonly cdPlayer: THREE.Mesh;
  private readonly cdMaterial: THREE.MeshStandardMaterial;
  private readonly raycaster = new THREE.Raycaster();
  private readonly velocity = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  private readonly keys: KeyState = { w: false, a: false, s: false, d: false };
  private hoverDirty = true;
  private lastFrameTime = performance.now();
  private readonly disposers: Array<() => void> = [];

  constructor(host: HTMLElement) {
    this.host = host;

    // 1. renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    // 2. attach engine BEFORE THREE.AudioListener is constructed
    const detachEngine = attach(engine, this.renderer);
    this.disposers.push(detachEngine);

    // 3. scene + camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101015);
    this.camera = new THREE.PerspectiveCamera(70, host.clientWidth / host.clientHeight, 0.05, 100);
    this.camera.position.set(0, EYE_HEIGHT, 4);

    // 4. listener tracks the camera transform
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    // 5. room (inverted box) + floor + lights
    this.buildRoom();

    // 6. speaker mesh (anchored to PannerAnchor for spatial audio)
    const speaker = this.buildSpeaker();
    const anchor = new PannerAnchor(engine.spatial.panner);
    anchor.add(speaker);
    anchor.position.set(-3.5, 1.0, -4.0);
    this.scene.add(anchor);

    // 7. CD player mesh (clickable target)
    const { cdPlayer, table, material } = this.buildCdPlayer();
    cdPlayer.position.set(2.0, 0.95, -1.0);
    table.position.set(2.0, 0.4, -1.0);
    this.scene.add(table);
    this.scene.add(cdPlayer);
    this.cdPlayer = cdPlayer;
    this.cdMaterial = material;

    // 8. controls (camera is the controlled object — no scene.add needed in v0.160+)
    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);

    // 9. listeners
    this.bindEventListeners();

    // 10. effect: hover → emissive bump
    this.disposers.push(
      effect(() => {
        const hover = engine.ui.$().cdHover;
        this.cdMaterial.emissiveIntensity = hover ? 0.6 : 0;
      }),
    );

    // 11. start render loop
    this.renderer.setAnimationLoop(this.animate);
  }

  private buildRoom(): void {
    // inverted box for walls + ceiling
    const wallGeo = new THREE.BoxGeometry(ROOM_W, ROOM_H, ROOM_D);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xeeeae0,
      side: THREE.BackSide,
      roughness: 0.85,
    });
    const room = new THREE.Mesh(wallGeo, wallMat);
    room.position.y = ROOM_H / 2;
    this.scene.add(room);

    // floor (lifted slightly to avoid z-fighting with room's back-face bottom)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, ROOM_D), new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.75 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    this.scene.add(floor);

    // lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0xc8c8d8, 1.3);
    this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(2, 4, 2);
    this.scene.add(dir);
  }

  private buildSpeaker(): THREE.Object3D {
    const group = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.4), new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6 }));
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.16, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.4 }),
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.z = 0.2;
    cone.position.y = 0.05;
    const tweeter = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.3 }));
    tweeter.position.set(0, -0.18, 0.21);
    group.add(cab, cone, tweeter);
    return group;
  }

  private buildCdPlayer(): {
    cdPlayer: THREE.Mesh;
    table: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
  } {
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.7 }));
    const material = new THREE.MeshStandardMaterial({
      color: 0x9aa5b8,
      metalness: 0.6,
      roughness: 0.35,
      emissive: 0x4488ff,
      emissiveIntensity: 0,
    });
    const cdPlayer = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.55), material);
    cdPlayer.userData.clickable = true;

    // visual marker on top — a CD disc
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.005, 32),
      new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        metalness: 0.9,
        roughness: 0.15,
      }),
    );
    disc.position.y = 0.065;
    cdPlayer.add(disc);
    return { cdPlayer, table, material };
  }

  private bindEventListeners(): void {
    const dom = this.renderer.domElement;

    const onClick = () => {
      if (!this.controls.isLocked && !engine.ui.value.popupOpen) {
        this.controls.lock();
      }
    };
    dom.addEventListener("click", onClick);
    this.disposers.push(() => dom.removeEventListener("click", onClick));

    const onMouseDown = (_e: MouseEvent) => {
      if (!this.controls.isLocked) return;
      if (this.raycastCdPlayer()) {
        engine.ui.update((d) => {
          d.popupOpen = true;
        });
        this.controls.unlock();
      }
    };
    dom.addEventListener("mousedown", onMouseDown);
    this.disposers.push(() => dom.removeEventListener("mousedown", onMouseDown));

    const onPointerMove = () => {
      this.hoverDirty = true;
    };
    dom.addEventListener("pointermove", onPointerMove);
    this.disposers.push(() => dom.removeEventListener("pointermove", onPointerMove));

    const onKeyDown = (e: KeyboardEvent) => this.setKey(e.code, true);
    const onKeyUp = (e: KeyboardEvent) => this.setKey(e.code, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.disposers.push(() => window.removeEventListener("keydown", onKeyDown));
    this.disposers.push(() => window.removeEventListener("keyup", onKeyUp));

    const onResize = () => {
      const w = this.host.clientWidth;
      const h = this.host.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    this.disposers.push(() => window.removeEventListener("resize", onResize));
  }

  private setKey(code: string, down: boolean): void {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        this.keys.w = down;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.keys.a = down;
        break;
      case "KeyS":
      case "ArrowDown":
        this.keys.s = down;
        break;
      case "KeyD":
      case "ArrowRight":
        this.keys.d = down;
        break;
    }
  }

  private raycastCdPlayer(): boolean {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObject(this.cdPlayer, true);
    return hits.length > 0;
  }

  private animate = (): void => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (this.controls.isLocked) {
      // input → desired velocity in camera-relative space
      let dx = 0;
      let dz = 0;
      if (this.keys.w) dz += 1;
      if (this.keys.s) dz -= 1;
      if (this.keys.d) dx += 1;
      if (this.keys.a) dx -= 1;
      if (dx !== 0 && dz !== 0) {
        const inv = 1 / Math.SQRT2;
        dx *= inv;
        dz *= inv;
      }

      // simple damping toward target velocity
      const targetVx = dx * MOVE_SPEED;
      const targetVz = dz * MOVE_SPEED;
      const damp = 1 - Math.exp(-DAMPING * dt);
      this.velocity.x += (targetVx - this.velocity.x) * damp;
      this.velocity.z += (targetVz - this.velocity.z) * damp;

      this.controls.moveRight(this.velocity.x * dt);
      this.controls.moveForward(this.velocity.z * dt);

      // clamp inside the room
      const limX = ROOM_W / 2 - WALL_MARGIN;
      const limZ = ROOM_D / 2 - WALL_MARGIN;
      const pos = this.camera.position;
      pos.x = Math.max(-limX, Math.min(limX, pos.x));
      pos.z = Math.max(-limZ, Math.min(limZ, pos.z));
      pos.y = EYE_HEIGHT;
    } else {
      this.velocity.set(0, 0, 0);
    }

    if (this.hoverDirty && this.controls.isLocked) {
      this.hoverDirty = false;
      const hit = this.raycastCdPlayer();
      if (engine.ui.value.cdHover !== hit) {
        engine.ui.update((d) => {
          d.cdHover = hit;
        });
      }
    } else if (!this.controls.isLocked && engine.ui.value.cdHover) {
      engine.ui.update((d) => {
        d.cdHover = false;
      });
    }

    // keep `forward` ref live for any future use; cheap call
    this.camera.getWorldDirection(this.forward);

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.controls.dispose();
    for (const d of this.disposers.splice(0)) {
      try {
        d();
      } catch {
        // ignore
      }
    }
    this.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        mesh.geometry.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.host) {
      this.host.removeChild(this.renderer.domElement);
    }
  }
}
