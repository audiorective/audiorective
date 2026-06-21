import * as pc from "playcanvas";
import { effect } from "alien-signals";
import { attach, bindPanner } from "@audiorective/playcanvas";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";
import { hoverOffset } from "./hover";
import { clampToRoom } from "./roomMath";
import { matchAction } from "../config/appConfig";

const ROOM_W = 14;
const ROOM_H = 5;
const ROOM_D = 16;
const WALL_MARGIN = 0.5;
const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 3.0;
const DAMPING = 8.0;
const MOUSE_SENSITIVITY = 0.0022;
const SELECT_DIST = 8;

type KeyState = { w: boolean; a: boolean; s: boolean; d: boolean };

type DroneEntry = {
  channel: Channel;
  entity: pc.Entity;
  material: pc.StandardMaterial;
  base: pc.Vec3;
  seed: number;
};

export class LivehouseScene {
  private readonly host: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly app: pc.AppBase;
  private readonly camera: pc.Entity;
  private readonly drones: DroneEntry[] = [];

  private readonly keys: KeyState = { w: false, a: false, s: false, d: false };
  private readonly velocity = new pc.Vec3();
  private readonly tmpVec = new pc.Vec3();
  private readonly tmpMat = new pc.Mat4();
  private yaw = 0;
  private pitch = 0;
  private isLocked = false;
  private started = false;
  private elapsed = 0;
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

    this.app = new pc.Application(this.canvas, {
      mouse: new pc.Mouse(this.canvas),
      keyboard: new pc.Keyboard(window),
      graphicsDeviceOptions: { alpha: false },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);

    // Share the engine's AudioContext + arm autoStart on the canvas.
    this.disposers.push(attach(engine, this.app));

    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", {
      clearColor: new pc.Color(0.03, 0.03, 0.06),
      farClip: 100,
      nearClip: 0.05,
      fov: 70,
    });
    this.camera.addComponent("audiolistener");
    this.camera.setPosition(0, EYE_HEIGHT, 6);
    this.app.root.addChild(this.camera);

    this.buildRoom();
    this.buildDrones();
    this.bindEventListeners();

    // Selection highlight: emissive bump on the selected drone.
    this.disposers.push(
      effect(() => {
        const id = engine.selectedChannelId.$();
        for (const d of this.drones) {
          d.material.emissiveIntensity = d.channel.id === id ? 1.1 : 0.4;
          d.material.update();
        }
      }),
    );

    // Drone base position follows the channel.position cell.
    for (const d of this.drones) {
      this.disposers.push(
        effect(() => {
          const p = d.channel.cells.position.$();
          d.base.set(p.x, p.y, p.z);
        }),
      );
    }

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
    const wallMat = new pc.StandardMaterial();
    wallMat.diffuse = new pc.Color(0.08, 0.08, 0.12);
    wallMat.cull = pc.CULLFACE_FRONT;
    wallMat.update();
    const room = new pc.Entity("room");
    room.addComponent("render", { type: "box", material: wallMat });
    room.setPosition(0, ROOM_H / 2, 0);
    room.setLocalScale(ROOM_W, ROOM_H, ROOM_D);
    this.app.root.addChild(room);

    const floorMat = new pc.StandardMaterial();
    floorMat.diffuse = new pc.Color(0.05, 0.05, 0.07);
    floorMat.update();
    const floor = new pc.Entity("floor");
    floor.addComponent("render", { type: "plane", material: floorMat });
    floor.setLocalScale(ROOM_W, 1, ROOM_D);
    floor.setLocalPosition(0, 0.01, 0);
    this.app.root.addChild(floor);

    // Stage: a low platform at the back as a visual anchor (no audio meaning).
    const stageMat = new pc.StandardMaterial();
    stageMat.diffuse = new pc.Color(0.12, 0.12, 0.18);
    stageMat.emissive = new pc.Color(0.05, 0.2, 0.16);
    stageMat.update();
    const stage = new pc.Entity("stage");
    stage.addComponent("render", { type: "box", material: stageMat });
    stage.setLocalScale(ROOM_W * 0.7, 0.4, ROOM_D * 0.25);
    stage.setPosition(0, 0.2, -ROOM_D / 2 + ROOM_D * 0.18);
    this.app.root.addChild(stage);

    this.app.scene.ambientLight = new pc.Color(0.25, 0.25, 0.35);
    const sun = new pc.Entity("sun");
    sun.addComponent("light", { type: "directional", color: new pc.Color(0.7, 0.7, 0.9), intensity: 1.0 });
    sun.setEulerAngles(55, 30, 0);
    this.app.root.addChild(sun);
  }

  private buildDrones(): void {
    const sphere = (color: pc.Color): { entity: pc.Entity; material: pc.StandardMaterial } => {
      const material = new pc.StandardMaterial();
      material.diffuse = color;
      material.emissive = color;
      material.emissiveIntensity = 0.4;
      material.useMetalness = true;
      material.metalness = 0.3;
      material.gloss = 0.6;
      material.update();
      const entity = new pc.Entity("drone");
      entity.addComponent("render", { type: "sphere", material });
      entity.setLocalScale(0.6, 0.6, 0.6);
      return { entity, material };
    };

    engine.channels.forEach((channel, i) => {
      const c = new pc.Color();
      c.fromString(channel.color);
      const { entity, material } = sphere(c);
      const p = channel.cells.position.value;
      const base = new pc.Vec3(p.x, p.y, p.z);
      entity.setPosition(base);
      this.app.root.addChild(entity);
      this.disposers.push(bindPanner(this.app, entity, channel.spatial.panner));
      this.drones.push({ channel, entity, material, base, seed: i });
    });
  }

  private bindEventListeners(): void {
    const onClick = () => {
      if (engine.ui.value.hudOpen) return;
      if (!this.isLocked) {
        this.canvas.requestPointerLock();
        if (!this.started) {
          this.started = true;
          engine.start();
        }
      } else {
        this.selectUnderCrosshair();
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
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
      this.camera.setEulerAngles((this.pitch * 180) / Math.PI, (this.yaw * 180) / Math.PI, 0);
    };
    document.addEventListener("mousemove", onMouseMove);
    this.disposers.push(() => document.removeEventListener("mousemove", onMouseMove));

    const setKey = (e: KeyboardEvent, down: boolean) => {
      switch (matchAction(e)) {
        case "forward":
          this.keys.w = down;
          break;
        case "back":
          this.keys.s = down;
          break;
        case "left":
          this.keys.a = down;
          break;
        case "right":
          this.keys.d = down;
          break;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => setKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.disposers.push(() => window.removeEventListener("keydown", onKeyDown));
    this.disposers.push(() => window.removeEventListener("keyup", onKeyUp));

    // Exit pointer-lock whenever the HUD opens (so the mouse drives the HUD).
    this.disposers.push(
      effect(() => {
        if (engine.ui.$().hudOpen && document.pointerLockElement === this.canvas) {
          document.exitPointerLock();
        }
      }),
    );
  }

  private selectUnderCrosshair(): void {
    // Crosshair sits at canvas center; pick the closest drone within the view cone.
    const camPos = this.camera.getPosition();
    this.tmpMat.copy(this.camera.getWorldTransform());
    const fwd = new pc.Vec3(-this.tmpMat.data[8], -this.tmpMat.data[9], -this.tmpMat.data[10]);
    let best: DroneEntry | null = null;
    let bestDot = 0.95;
    for (const d of this.drones) {
      this.tmpVec.sub2(d.entity.getPosition(), camPos);
      const dist = this.tmpVec.length();
      if (dist > SELECT_DIST) continue;
      this.tmpVec.normalize();
      const dot = fwd.dot(this.tmpVec);
      if (dot > bestDot) {
        bestDot = dot;
        best = d;
      }
    }
    if (best && engine.selectedChannelId.value !== best.channel.id) {
      engine.selectedChannelId.value = best.channel.id;
    }
  }

  private update(dt: number): void {
    const clamped = Math.min(0.05, dt);
    this.elapsed += clamped;

    // Drone idle hover (bindPanner reads the entity transform after this).
    for (const d of this.drones) {
      const o = hoverOffset(this.elapsed, d.seed);
      d.entity.setPosition(d.base.x + o.x, d.base.y + o.y, d.base.z + o.z);
    }

    if (this.isLocked && !engine.ui.value.hudOpen) {
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
      const damp = 1 - Math.exp(-DAMPING * clamped);
      this.velocity.x += (dx * MOVE_SPEED - this.velocity.x) * damp;
      this.velocity.z += (dz * MOVE_SPEED - this.velocity.z) * damp;

      const fwd = this.camera.forward;
      const right = this.camera.right;
      const fLen = Math.hypot(fwd.x, fwd.z) || 1;
      const rLen = Math.hypot(right.x, right.z) || 1;
      const worldDX = (right.x / rLen) * this.velocity.x + (fwd.x / fLen) * this.velocity.z;
      const worldDZ = (right.z / rLen) * this.velocity.x + (fwd.z / fLen) * this.velocity.z;

      const pos = this.camera.getPosition().clone();
      const next = clampToRoom(pos.x + worldDX * clamped, pos.z + worldDZ * clamped, {
        halfW: ROOM_W / 2,
        halfD: ROOM_D / 2,
        margin: WALL_MARGIN,
      });
      this.camera.setPosition(next.x, EYE_HEIGHT, next.z);
    } else {
      this.velocity.set(0, 0, 0);
    }
  }

  dispose(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    for (const d of this.disposers.splice(0)) {
      try {
        d();
      } catch {
        // ignore
      }
    }
    this.app.destroy();
    if (this.canvas.parentElement === this.host) this.host.removeChild(this.canvas);
  }
}
