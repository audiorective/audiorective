import * as pc from "playcanvas";
import { effect } from "alien-signals";
import { attach } from "@audiorective/playcanvas";
import { engine } from "../audio/engine";

const ROOM_W = 10;
const ROOM_H = 3;
const ROOM_D = 10;
const WALL_MARGIN = 0.3;
const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.0;
const DAMPING = 8.0;
const MOUSE_SENSITIVITY = 0.0022;

type KeyState = { w: boolean; a: boolean; s: boolean; d: boolean };

export class PCRoomScene {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly app: pc.AppBase;
  private readonly camera: pc.Entity;
  private readonly speaker: pc.Entity;
  private readonly cdPlayer: pc.Entity;
  private readonly cdMaterial: pc.StandardMaterial;

  private readonly keys: KeyState = { w: false, a: false, s: false, d: false };
  private readonly velocity = new pc.Vec3();
  private readonly tmpVec = new pc.Vec3();
  private readonly tmpMat = new pc.Mat4();
  private yaw = 0;
  private pitch = 0;
  private isLocked = false;
  private hoverDirty = true;
  private readonly disposers: Array<() => void> = [];

  constructor(host: HTMLElement) {
    this.host = host;

    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    host.appendChild(this.canvas);
    this.canvas.width = host.clientWidth;
    this.canvas.height = host.clientHeight;

    // 1. Build the PlayCanvas app. Don't access app.systems.sound.context yet —
    //    attach() will install the engine's context before PlayCanvas lazy-creates one.
    this.app = new pc.Application(this.canvas, {
      mouse: new pc.Mouse(this.canvas),
      keyboard: new pc.Keyboard(window),
      graphicsDeviceOptions: { alpha: false },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // 2. Share AudioContext + arm autoStart on the canvas.
    this.disposers.push(attach(engine, this.app));

    // 3. Scene + camera + listener.
    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", {
      clearColor: new pc.Color(0.063, 0.063, 0.082),
      farClip: 100,
      nearClip: 0.05,
      fov: 70,
    });
    this.camera.addComponent("audiolistener");
    this.camera.setPosition(0, EYE_HEIGHT, 4);
    this.app.root.addChild(this.camera);

    // 4. Room geometry + lights.
    this.buildRoom();

    // 5. Speaker entity with a positional SoundComponent — slot acts as the spatial source.
    this.speaker = new pc.Entity("speaker");
    this.speaker.setPosition(-3.5, 1.0, -4.0);
    this.speaker.addComponent("sound", {
      positional: true,
      distanceModel: pc.DISTANCE_INVERSE,
      refDistance: 1.5,
      maxDistance: 25,
      rollOffFactor: 1.4,
    });
    this.attachSpeakerMesh(this.speaker);
    this.app.root.addChild(this.speaker);

    const sound = this.speaker.sound;
    if (!sound) throw new Error("speaker SoundComponent failed to mount");

    // PlayCanvas owns source + spatializer; the player builds one
    // audiorective slot per track with its own EQ chain.
    engine.player.attach(this.app, sound);
    this.disposers.push(() => engine.player.detach());

    // 7. CD player mesh (clickable popup target).
    const { cdPlayer, table, material } = this.buildCdPlayer();
    cdPlayer.setPosition(2.0, 0.95, -1.0);
    table.setPosition(2.0, 0.4, -1.0);
    this.app.root.addChild(table);
    this.app.root.addChild(cdPlayer);
    this.cdPlayer = cdPlayer;
    this.cdMaterial = material;

    // 8. Pointer-lock controls.
    this.bindEventListeners();

    // 9. Hover-on-CD → emissive bump.
    this.disposers.push(
      effect(() => {
        const hover = engine.ui.$().cdHover;
        this.cdMaterial.emissiveIntensity = hover ? 0.6 : 0;
        this.cdMaterial.update();
      }),
    );

    // 10. Per-frame update.
    const onUpdate = (dt: number) => this.update(dt);
    this.app.on("update", onUpdate);
    this.disposers.push(() => this.app.off("update", onUpdate));

    this.app.start();

    const onResize = () => {
      this.canvas.width = host.clientWidth;
      this.canvas.height = host.clientHeight;
      this.app.resizeCanvas(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);
    this.disposers.push(() => window.removeEventListener("resize", onResize));
  }

  private buildRoom(): void {
    const wallColor = new pc.Color(0.93, 0.91, 0.88);
    const floorColor = new pc.Color(0.85, 0.79, 0.66);

    const wallMat = new pc.StandardMaterial();
    wallMat.diffuse = wallColor;
    wallMat.cull = pc.CULLFACE_FRONT;
    wallMat.update();

    const room = new pc.Entity("room");
    room.addComponent("render", { type: "box", material: wallMat });
    room.setPosition(0, ROOM_H / 2, 0);
    room.setLocalScale(ROOM_W, ROOM_H, ROOM_D);
    this.app.root.addChild(room);

    const floorMat = new pc.StandardMaterial();
    floorMat.diffuse = floorColor;
    floorMat.update();

    const floor = new pc.Entity("floor");
    floor.addComponent("render", { type: "plane", material: floorMat });
    floor.setLocalScale(ROOM_W, 1, ROOM_D);
    // lifted slightly to avoid z-fighting with the room's back-face bottom
    floor.setLocalPosition(0, 0.01, 0);
    this.app.root.addChild(floor);

    // Ambient lift for overall scene brightness — the StandardMaterial respects
    // app.scene.ambientLight as a diffuse floor across all unlit surfaces.
    this.app.scene.ambientLight = new pc.Color(0.45, 0.45, 0.5);

    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: new pc.Color(1, 1, 1),
      intensity: 1.4,
    });
    sun.setEulerAngles(50, 30, 0);
    this.app.root.addChild(sun);

    const ambient = new pc.Entity("ambient");
    ambient.addComponent("light", {
      type: "omni",
      color: new pc.Color(0.95, 0.95, 1),
      intensity: 0.8,
      range: 30,
    });
    ambient.setPosition(0, ROOM_H - 0.2, 0);
    this.app.root.addChild(ambient);
  }

  private attachSpeakerMesh(parent: pc.Entity): void {
    const cabMat = new pc.StandardMaterial();
    cabMat.diffuse = new pc.Color(0.133, 0.133, 0.149);
    cabMat.update();

    const cab = new pc.Entity("speaker-cab");
    cab.addComponent("render", { type: "box", material: cabMat });
    cab.setLocalScale(0.4, 0.6, 0.4);
    parent.addChild(cab);

    const coneMat = new pc.StandardMaterial();
    coneMat.diffuse = new pc.Color(0.067, 0.067, 0.078);
    coneMat.update();

    const cone = new pc.Entity("speaker-cone");
    cone.addComponent("render", { type: "cylinder", material: coneMat });
    cone.setLocalEulerAngles(90, 0, 0);
    cone.setLocalPosition(0, 0.05, 0.21);
    cone.setLocalScale(0.3, 0.06, 0.3);
    parent.addChild(cone);
  }

  private buildCdPlayer(): { cdPlayer: pc.Entity; table: pc.Entity; material: pc.StandardMaterial } {
    const tableMat = new pc.StandardMaterial();
    tableMat.diffuse = new pc.Color(0.333, 0.267, 0.2);
    tableMat.update();

    const table = new pc.Entity("table");
    table.addComponent("render", { type: "box", material: tableMat });
    table.setLocalScale(0.9, 0.8, 0.7);

    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color(0.604, 0.647, 0.722);
    material.metalness = 0.6;
    material.useMetalness = true;
    material.gloss = 0.65;
    material.emissive = new pc.Color(0.267, 0.533, 1);
    material.emissiveIntensity = 0;
    material.update();

    const cdPlayer = new pc.Entity("cd-player");
    cdPlayer.addComponent("render", { type: "box", material });
    cdPlayer.setLocalScale(0.7, 0.12, 0.55);

    const discMat = new pc.StandardMaterial();
    discMat.diffuse = new pc.Color(0.93, 0.93, 0.93);
    discMat.metalness = 0.9;
    discMat.useMetalness = true;
    discMat.gloss = 0.85;
    discMat.update();

    const disc = new pc.Entity("cd-disc");
    disc.addComponent("render", { type: "cylinder", material: discMat });
    disc.setLocalPosition(0, 0.065, 0);
    disc.setLocalScale(0.36, 0.005, 0.36);
    cdPlayer.addChild(disc);

    return { cdPlayer, table, material };
  }

  private bindEventListeners(): void {
    const onClick = () => {
      if (engine.ui.value.popupOpen) return;
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
      } else if (this.raycastCdPlayer()) {
        engine.ui.update((d) => {
          d.popupOpen = true;
        });
        document.exitPointerLock();
      }
    };
    this.canvas.addEventListener("click", onClick);
    this.disposers.push(() => this.canvas.removeEventListener("click", onClick));

    const onLockChange = () => {
      this.isLocked = document.pointerLockElement === this.canvas;
    };
    document.addEventListener("pointerlockchange", onLockChange);
    this.disposers.push(() => document.removeEventListener("pointerlockchange", onLockChange));

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isLocked) return;
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      const lim = Math.PI / 2 - 0.01;
      if (this.pitch > lim) this.pitch = lim;
      if (this.pitch < -lim) this.pitch = -lim;
      this.applyCameraOrientation();
      this.hoverDirty = true;
    };
    document.addEventListener("mousemove", onMouseMove);
    this.disposers.push(() => document.removeEventListener("mousemove", onMouseMove));

    const onKeyDown = (e: KeyboardEvent) => this.setKey(e.code, true);
    const onKeyUp = (e: KeyboardEvent) => this.setKey(e.code, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.disposers.push(() => window.removeEventListener("keydown", onKeyDown));
    this.disposers.push(() => window.removeEventListener("keyup", onKeyUp));
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

  private applyCameraOrientation(): void {
    const yawDeg = (this.yaw * 180) / Math.PI;
    const pitchDeg = (this.pitch * 180) / Math.PI;
    this.camera.setEulerAngles(pitchDeg, yawDeg, 0);
  }

  private raycastCdPlayer(): boolean {
    // Cheap proximity test instead of a true raycast — pointer-lock crosshair sits at
    // canvas center, and the CD player is the only clickable thing in the room.
    const camPos = this.camera.getPosition();
    const cdPos = this.cdPlayer.getPosition();
    this.tmpVec.sub2(cdPos, camPos);
    const dist = this.tmpVec.length();
    if (dist > 4) return false;
    this.tmpVec.normalize();
    this.tmpMat.copy(this.camera.getWorldTransform());
    const fwd = new pc.Vec3(-this.tmpMat.data[8], -this.tmpMat.data[9], -this.tmpMat.data[10]);
    const dot = fwd.dot(this.tmpVec);
    return dot > 0.93;
  }

  private update(dt: number): void {
    const clamped = Math.min(0.05, dt);
    if (this.isLocked) {
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

      // velocity in camera-local axes: x = right intent, z = forward intent
      const targetVx = dx * MOVE_SPEED;
      const targetVz = dz * MOVE_SPEED;
      const damp = 1 - Math.exp(-DAMPING * clamped);
      this.velocity.x += (targetVx - this.velocity.x) * damp;
      this.velocity.z += (targetVz - this.velocity.z) * damp;

      // Resolve into world-space deltas using camera basis (flattened to horizontal).
      const fwd = this.camera.forward;
      const right = this.camera.right;
      const fLen = Math.hypot(fwd.x, fwd.z);
      const rLen = Math.hypot(right.x, right.z);
      const fX = fLen > 1e-6 ? fwd.x / fLen : 0;
      const fZ = fLen > 1e-6 ? fwd.z / fLen : 0;
      const rX = rLen > 1e-6 ? right.x / rLen : 0;
      const rZ = rLen > 1e-6 ? right.z / rLen : 0;

      const worldDX = rX * this.velocity.x + fX * this.velocity.z;
      const worldDZ = rZ * this.velocity.x + fZ * this.velocity.z;

      const pos = this.camera.getPosition().clone();
      pos.x += worldDX * clamped;
      pos.z += worldDZ * clamped;
      const limX = ROOM_W / 2 - WALL_MARGIN;
      const limZ = ROOM_D / 2 - WALL_MARGIN;
      pos.x = Math.max(-limX, Math.min(limX, pos.x));
      pos.z = Math.max(-limZ, Math.min(limZ, pos.z));
      pos.y = EYE_HEIGHT;
      this.camera.setPosition(pos);
    } else {
      this.velocity.set(0, 0, 0);
    }

    if (this.hoverDirty && this.isLocked) {
      this.hoverDirty = false;
      const hit = this.raycastCdPlayer();
      if (engine.ui.value.cdHover !== hit) {
        engine.ui.update((d) => {
          d.cdHover = hit;
        });
      }
    } else if (!this.isLocked && engine.ui.value.cdHover) {
      engine.ui.update((d) => {
        d.cdHover = false;
      });
    }
  }

  dispose(): void {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    for (const d of this.disposers.splice(0)) {
      try {
        d();
      } catch {
        // ignore
      }
    }
    this.app.destroy();
    if (this.canvas.parentElement === this.host) {
      this.host.removeChild(this.canvas);
    }
  }
}
