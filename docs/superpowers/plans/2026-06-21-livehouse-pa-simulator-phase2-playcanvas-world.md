# Livehouse PA Simulator — Phase 2: PlayCanvas World + Spatial Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the cyber-livehouse in PlayCanvas — a walkable first-person venue with six glowing drones — and wire it to the Phase 1 audio engine: each drone's transform drives its channel's `Spatial` panner via `bindPanner`, the drone position follows the channel's `position` cell (+ idle hover), the camera's audiolistener drives the shared listener, and the world is mounted in React so the whole thing is audible and playable.

**Architecture:** A plain `LivehouseScene` TypeScript class owns the PlayCanvas app (adapted from the existing `PCRoomScene`). It reads engine state via alien-signals `effect` and writes shared view state (`selectedChannelId`, `ui.hudOpen`) with `.value` — no React back-channels. `attach(engine, app)` shares the one `AudioContext`; `bindPanner(app, droneEntity, channel.spatial.panner)` is the only visual→audio coupling. A thin React `SceneHost` mounts it; `engine.start()` fires on the first user gesture.

**Tech Stack:** PlayCanvas, `@audiorective/playcanvas` (`attach`, `bindPanner`), `@audiorective/core` (`effect` via alien-signals), React (DOM host only), Vitest browser mode for the pure helpers.

**Depends on:** Phase 1 (audio core: `engine`, `Channel`, `engine.channels`, `channel.position`, `channel.spatial`, `engine.selectedChannelId`, `engine.ui`, `engine.start()`). This is **Phase 2 of 4**. Spec: `docs/superpowers/specs/2026-06-21-livehouse-pa-simulator-design.md`.

---

## File Structure

All under `apps/showroom/`. Reuses the existing `PCRoomScene` as the structural template (room build, pointer-lock walk controller) but is a new file — `PCRoomScene` is deleted with the rest of `src/examples/**` in Phase 3.

| File                                                     | Responsibility                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/scene/hover.ts` (create)                            | Pure deterministic idle-hover offset for a drone                                                                                |
| `src/scene/roomMath.ts` (create)                         | Pure `clampToRoom` (keep the player inside the walls)                                                                           |
| `src/scene/LivehouseScene.ts` (create)                   | PlayCanvas app: venue, drones, walk, `bindPanner`, position/selection sync, pointer-lock gating, first-gesture `engine.start()` |
| `src/ui/SceneHost.tsx` (create)                          | React DOM host that constructs/disposes the scene                                                                               |
| `src/ui/App.tsx` (create)                                | `EngineProvider` + `SceneHost` + a minimal text hint (full HUD lands in Phase 3)                                                |
| `src/main.tsx` (modify)                                  | Render the new `ui/App` instead of the picker                                                                                   |
| `tests/hover.test.ts`, `tests/roomMath.test.ts` (create) | Unit tests for the pure helpers                                                                                                 |

> **Manual verification:** PlayCanvas/walk behavior can't be unit-tested meaningfully. Per repo convention, **do not start the dev server yourself** — ask the user to run `pnpm --filter @audiorective/showroom dev`, then verify in the browser (chrome-devtools MCP screenshot/snapshot). Verification checkpoints are explicit steps below.

---

## Task 1: `hover` — deterministic idle drift

**Files:**

- Create: `apps/showroom/src/scene/hover.ts`
- Test: `apps/showroom/tests/hover.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from "vitest";
import { hoverOffset } from "../src/scene/hover";

describe("hoverOffset", () => {
  test("is deterministic for the same (t, seed)", () => {
    expect(hoverOffset(1.23, 2)).toEqual(hoverOffset(1.23, 2));
  });
  test("different seeds give different offsets at the same time", () => {
    expect(hoverOffset(1.23, 0)).not.toEqual(hoverOffset(1.23, 5));
  });
  test("stays within a small bounded radius", () => {
    for (let t = 0; t < 10; t += 0.37) {
      const o = hoverOffset(t, 3);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(o.z)).toBeLessThanOrEqual(0.4);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run hover`
Expected: FAIL — cannot resolve `../scene/hover`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/scene/hover.ts
import type { Vec3 } from "../audio/spatialMath";

const AMP = 0.25; // metres
const SPEED = 0.6; // rad/s base

/** Gentle, deterministic per-drone hover bob. Phase offset by `seed` so drones don't move in lockstep. */
export function hoverOffset(t: number, seed: number): Vec3 {
  const p = seed * 1.7;
  return {
    x: Math.sin(t * SPEED + p) * AMP,
    y: Math.sin(t * SPEED * 1.3 + p * 2) * AMP,
    z: Math.cos(t * SPEED * 0.8 + p) * AMP,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run hover`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/scene/hover.ts apps/showroom/tests/hover.test.ts
git commit -m "feat(showroom): deterministic drone hover offset"
```

---

## Task 2: `roomMath` — clamp player to the room

**Files:**

- Create: `apps/showroom/src/scene/roomMath.ts`
- Test: `apps/showroom/tests/roomMath.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from "vitest";
import { clampToRoom } from "../src/scene/roomMath";

describe("clampToRoom", () => {
  const opts = { halfW: 7, halfD: 8, margin: 0.5 };
  test("leaves interior points untouched", () => {
    expect(clampToRoom(2, -3, opts)).toEqual({ x: 2, z: -3 });
  });
  test("clamps x to ±(halfW - margin)", () => {
    expect(clampToRoom(100, 0, opts).x).toBeCloseTo(6.5);
    expect(clampToRoom(-100, 0, opts).x).toBeCloseTo(-6.5);
  });
  test("clamps z to ±(halfD - margin)", () => {
    expect(clampToRoom(0, 100, opts).z).toBeCloseTo(7.5);
    expect(clampToRoom(0, -100, opts).z).toBeCloseTo(-7.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run roomMath`
Expected: FAIL — cannot resolve `../src/scene/roomMath`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/scene/roomMath.ts
export interface RoomBounds {
  halfW: number;
  halfD: number;
  margin: number;
}

/** Clamp a horizontal (x, z) position to stay inside the room walls. */
export function clampToRoom(x: number, z: number, b: RoomBounds): { x: number; z: number } {
  const limX = b.halfW - b.margin;
  const limZ = b.halfD - b.margin;
  return {
    x: Math.max(-limX, Math.min(limX, x)),
    z: Math.max(-limZ, Math.min(limZ, z)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run roomMath`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/scene/roomMath.ts apps/showroom/tests/roomMath.test.ts
git commit -m "feat(showroom): clampToRoom helper"
```

---

## Task 3: `LivehouseScene` — the PlayCanvas world

**Files:**

- Create: `apps/showroom/src/scene/LivehouseScene.ts`

This adapts `src/examples/spatial-room-playcanvas/scene/PCRoomScene.ts` (read it first for the room/walk/pointer-lock pattern). Differences: it builds **six drones** (one per `engine.channels`), binds each to its channel's panner, drives each drone's position from `channel.position` (+ hover), highlights `engine.selectedChannelId`, selects a drone on click (raycast), gates pointer-lock on `engine.ui.value.hudOpen`, and calls `engine.start()` on the first lock.

- [ ] **Step 1: Create the file**

```ts
// apps/showroom/src/scene/LivehouseScene.ts
import * as pc from "playcanvas";
import { effect } from "alien-signals";
import { attach, bindPanner } from "@audiorective/playcanvas";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";
import { hoverOffset } from "./hover";
import { clampToRoom } from "./roomMath";

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

    const setKey = (code: string, down: boolean) => {
      if (code === "KeyW" || code === "ArrowUp") this.keys.w = down;
      else if (code === "KeyA" || code === "ArrowLeft") this.keys.a = down;
      else if (code === "KeyS" || code === "ArrowDown") this.keys.s = down;
      else if (code === "KeyD" || code === "ArrowRight") this.keys.d = down;
    };
    const onKeyDown = (e: KeyboardEvent) => setKey(e.code, true);
    const onKeyUp = (e: KeyboardEvent) => setKey(e.code, false);
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/showroom/src/scene/LivehouseScene.ts
git commit -m "feat(showroom): LivehouseScene PlayCanvas world + per-drone bindPanner"
```

---

## Task 4: Mount it in React

**Files:**

- Create: `apps/showroom/src/ui/SceneHost.tsx`
- Create: `apps/showroom/src/ui/App.tsx`
- Modify: `apps/showroom/src/main.tsx`

- [ ] **Step 1: Create `src/ui/SceneHost.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { LivehouseScene } from "../scene/LivehouseScene";

export function SceneHost() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hostRef.current) return;
    const scene = new LivehouseScene(hostRef.current);
    return () => scene.dispose();
  }, []);
  return <div ref={hostRef} style={{ position: "fixed", inset: 0 }} />;
}
```

- [ ] **Step 2: Create `src/ui/App.tsx`**

```tsx
import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { EngineProvider, engine } from "../audio/engine";
import { SceneHost } from "./SceneHost";

function Hint() {
  const state = useValue<EngineState>(engine.core.state);
  const text = state !== "running" ? "Click to enter the livehouse (enables audio)" : "WASD to move · click a drone to select it";
  return <div style={hintStyle}>{text}</div>;
}

export function App() {
  return (
    <EngineProvider>
      <SceneHost />
      <Hint />
    </EngineProvider>
  );
}

const hintStyle: CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "8px 14px",
  background: "rgba(8,10,14,0.55)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  color: "#cde",
  fontFamily: "system-ui, sans-serif",
  fontSize: 13,
  pointerEvents: "none",
  userSelect: "none",
};
```

- [ ] **Step 3: Repoint `src/main.tsx` to the new app**

Replace the entire contents of `apps/showroom/src/main.tsx` with:

```tsx
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors. (The old picker `src/App.tsx` is now unreferenced; it's deleted in Phase 3.)

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/ui/SceneHost.tsx apps/showroom/src/ui/App.tsx apps/showroom/src/main.tsx
git commit -m "feat(showroom): mount LivehouseScene as the root app"
```

---

## Task 5: Manual verification checkpoint

> The implementer does NOT start the dev server. Ask the user to run it, then verify.

- [ ] **Step 1: Ask the user to start the dev server**

Tell the user: "Phase 2 is built — please run `pnpm --filter @audiorective/showroom dev` and open the local URL (root page)." Wait for confirmation / the URL.

- [ ] **Step 2: Verify in the browser (chrome-devtools MCP)**

Take a screenshot and confirm:

- The dark venue renders with a back stage platform and **six glowing colored spheres** (drones) hovering.
- Clicking enters pointer-lock; WASD moves the camera; the camera stays inside the walls.
- Clicking a drone bumps its glow (selection) — cross-check `window.__paEngine.selectedChannelId.value` updates (evaluate in the page console via chrome-devtools).
- Audio is audible after the first click; walking past/around a drone changes its position in the stereo/spatial image.
- `window.__paEngine.channels[0].cells.position.value` exists; manually setting it (e.g. `window.__paEngine.channels[0].cells.position.value = {x:5,y:1.4,z:-4}`) visibly moves that drone and shifts its panning.

- [ ] **Step 3: Record the result**

Note any issues. If all good, Phase 2 is complete — no commit needed (verification only).

---

## Self-Review notes (for the implementer)

- **Spec coverage (§4.4, §5.1):** one `Spatial` per channel driven by PlayCanvas via `bindPanner` ✓; drone position follows `channel.position` cell (+ hover) ✓; camera audiolistener drives the listener ✓; selection highlight on `selectedChannelId` ✓; pointer-lock released on `ui.hudOpen` ✓; minimal primitives-only visuals (§ decision 10) ✓.
- **Single source of truth:** the scene only ever _reads_ `channel.position` to place the drone and _writes_ `selectedChannelId`/reads `ui.hudOpen` — no React back-channels. Repositioning drones (writing `channel.position`) is the Phase 3 three.js widget's job.
- **Type consistency:** uses Phase 1 exports `engine`, `engine.channels`, `Channel`, `channel.cells.position`, `channel.spatial.panner`, `engine.selectedChannelId`, `engine.ui`, `engine.start()`. `hoverOffset` (Task 1) and `clampToRoom` (Task 2) are consumed in Task 3.
- **Deferred:** the full HUD (channel strip, EQ panel, three.js panning widget, mixer, pads, keymap) and deleting `src/examples/**` + the old picker are Phase 3.
- **Reference:** `src/examples/spatial-room-playcanvas/scene/PCRoomScene.ts` is the structural template; read it before Task 3.

```

```
