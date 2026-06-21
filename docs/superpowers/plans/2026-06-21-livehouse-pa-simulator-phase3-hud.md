# Livehouse PA Simulator — Phase 3: iPad HUD + three.js Widgets + Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the toggleable, semi-transparent React iPad HUD — bottom-left menu → compact channel strip → `[EQ]`/`[Panning]` panels (rendered with three.js) → `[Mixer]` → sampler pads — wired to the engine via `useValue`; add the configurable keymap; then delete the three old demos and finish the single-page app.

**Architecture:** React reads/writes engine `Param`/`Cell`s through `useValue` and direct `.value`/`.update`. HUD-open is shared engine state (`engine.ui.hudOpen`, so the PlayCanvas scene can release pointer-lock); the _which-panel-is-open_ state is React-local. The two three.js widgets (`PanningScene`, `EqScene`) are **controllers only** — no audio nodes, no `THREE.AudioListener` — reading engine cells via alien-signals `effect` and writing them on drag. Keyboard input flows through a central `config/keymap.ts`.

**Tech Stack:** React 19, `@audiorective/react` (`useValue`, `useEngine`), three.js (control widgets), alien-signals (`effect`), Vitest browser mode (keymap unit tests).

**Depends on:** Phase 1 (engine/Channel/Mixer/SamplerSource) and Phase 2 (LivehouseScene mounted as root). This is **Phase 3 of 4**. Spec: `docs/superpowers/specs/2026-06-21-livehouse-pa-simulator-design.md`.

---

## File Structure

All under `apps/showroom/`.

| File                                                                                                | Responsibility                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/keymap.ts` (create)                                                                     | `Action`→key map + `matchAction` lookup; placeholder defaults (user-overridable)                                                                               |
| `src/ui/Meter.tsx` (create)                                                                         | Segmented level meter bound to a `level` cell                                                                                                                  |
| `src/ui/Fader.tsx` (create)                                                                         | Vertical fader bound to a volume `Param`                                                                                                                       |
| `src/ui/ChannelStrip.tsx` (create)                                                                  | Compact strip: fader, meter, S/M, `[EQ]`/`[Panning]` buttons                                                                                                   |
| `src/panning/PanningScene.ts` (create)                                                              | three.js controller: drag selected drone → `channel.position` cell                                                                                             |
| `src/ui/PanningPanel.tsx` (create)                                                                  | DOM host for `PanningScene`                                                                                                                                    |
| `src/eq/EqScene.ts` (create)                                                                        | three.js controller: drag band nodes → `channel.eq.params`                                                                                                     |
| `src/ui/EqPanel.tsx` (create)                                                                       | DOM host for `EqScene`                                                                                                                                         |
| `src/ui/MixerPanel.tsx` (create)                                                                    | Content-width compact mixer (fader+meter+M/S per channel + master)                                                                                             |
| `src/ui/PadPanel.tsx` (create)                                                                      | Sampler pads (click + keyboard) → `engine.sampler.trigger`                                                                                                     |
| `src/ui/ChannelMenu.tsx` (create)                                                                   | Bottom-left drone list + `Mixer` entry                                                                                                                         |
| `src/ui/Hud.tsx` (create)                                                                           | HUD orchestration: visibility, panel routing, Phones+Hide cluster, keymap                                                                                      |
| `src/ui/App.tsx` (modify)                                                                           | Add `<Hud />`                                                                                                                                                  |
| `src/audio/EQ3.ts`, `src/audio/instruments/StepSynth.ts`, `src/audio/MasterSequencer.ts` (relocate) | Move out of `examples/` before deleting it; fix imports in `Channel.ts`/`SynthSource.ts`/`engine.ts`                                                           |
| `vite.config.ts` (modify)                                                                           | Single-page (drop MPA inputs)                                                                                                                                  |
| **Deletions**                                                                                       | `src/examples/**`, `src/App.tsx` (picker), `src/shared/audio/MusicPlayer.ts`, the `sequencer/`, `spatial-room/`, `spatial-room-playcanvas/` html-entry folders |
| `README.md` / `docs/*` (modify)                                                                     | Replace the three-demo "Examples" section with the PA simulator                                                                                                |

> **Manual verification** (Task 12): the implementer does not start the dev server — ask the user to run it, verify via chrome-devtools MCP.

---

## Task 1: `keymap` + `matchAction` — ALREADY DONE (skip)

> **Superseded.** Implemented ahead of Phase 3 as part of the editable-config work: keybindings live in `apps/showroom/public/config.json`; the typed loader + `matchAction` live in `apps/showroom/src/config/appConfig.ts` (tested in `tests/appConfig.test.ts`). Phase 3 consumers (PadPanel Task 7, Hud Task 9) import `matchAction` from `../config/appConfig`. **Skip the steps below** — kept only for reference; do NOT create `config/keymap.ts`.

**Files:**

- Create: `apps/showroom/src/config/keymap.ts`
- Test: `apps/showroom/tests/keymap.test.ts`

> Defaults below are **placeholders** — the user will supply final keybindings. The structure is fixed; values are easy to change in one place.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from "vitest";
import { DEFAULT_KEYMAP, matchAction } from "../src/config/keymap";

const ev = (code: string) => ({ code }) as KeyboardEvent;

describe("keymap", () => {
  test("declares every action", () => {
    for (const a of ["forward", "back", "left", "right", "toggleHud", "toggleHeadphone", "pad1", "pad2", "pad3", "pad4"] as const) {
      expect(DEFAULT_KEYMAP[a]).toBeDefined();
    }
  });
  test("matchAction resolves a single-key binding", () => {
    expect(matchAction(ev("Tab"), DEFAULT_KEYMAP)).toBe("toggleHud");
  });
  test("matchAction resolves a multi-key binding (W and ArrowUp → forward)", () => {
    expect(matchAction(ev("KeyW"), DEFAULT_KEYMAP)).toBe("forward");
    expect(matchAction(ev("ArrowUp"), DEFAULT_KEYMAP)).toBe("forward");
  });
  test("matchAction returns null for an unbound key", () => {
    expect(matchAction(ev("KeyZ"), DEFAULT_KEYMAP)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @audiorective/showroom test -- --run keymap`
Expected: FAIL — cannot resolve `../src/config/keymap`.

- [ ] **Step 3: Write the implementation**

```ts
// apps/showroom/src/config/keymap.ts
export type Action = "forward" | "back" | "left" | "right" | "toggleHud" | "toggleHeadphone" | "pad1" | "pad2" | "pad3" | "pad4";

export type Keymap = Record<Action, readonly string[]>;

/**
 * PLACEHOLDER defaults — final values to be provided by the user. Keys are
 * KeyboardEvent.code values. All keyboard input in the app resolves through here.
 */
export const DEFAULT_KEYMAP: Keymap = {
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  toggleHud: ["Tab"],
  toggleHeadphone: ["KeyH"],
  pad1: ["Digit1"],
  pad2: ["Digit2"],
  pad3: ["Digit3"],
  pad4: ["Digit4"],
};

/** Resolve a keyboard event to its bound action, or null. */
export function matchAction(e: Pick<KeyboardEvent, "code">, keymap: Keymap = DEFAULT_KEYMAP): Action | null {
  for (const action of Object.keys(keymap) as Action[]) {
    if (keymap[action].includes(e.code)) return action;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @audiorective/showroom test -- --run keymap`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/showroom/src/config/keymap.ts apps/showroom/tests/keymap.test.ts
git commit -m "feat(showroom): configurable keymap + matchAction"
```

---

## Task 2: `Meter` + `Fader` primitives

**Files:**

- Create: `apps/showroom/src/ui/Meter.tsx`
- Create: `apps/showroom/src/ui/Fader.tsx`

- [ ] **Step 1: Create `src/ui/Meter.tsx`**

```tsx
import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { Readable } from "@audiorective/core";

/** Segmented level meter. `level` is a 0..~1 RMS cell updated by the Mixer metering loop. */
export function Meter({ level, height = 80 }: { level: Readable<number>; height?: number }) {
  const v = useValue(level);
  const segs = 10;
  const lit = Math.round(Math.min(1, v * 1.4) * segs);
  return (
    <div style={{ ...meterStyle, height }}>
      {Array.from({ length: segs }, (_, i) => {
        const idx = segs - 1 - i; // top-down
        const on = idx < lit;
        const color = idx >= segs - 2 ? "#dc2626" : idx >= segs - 4 ? "#eab308" : "#16a34a";
        return <div key={i} style={{ flex: 1, background: on ? color : "#16181f", borderRadius: 1 }} />;
      })}
    </div>
  );
}

const meterStyle: CSSProperties = {
  width: 8,
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: 1,
  background: "#0c0d12",
  borderRadius: 2,
};
```

- [ ] **Step 2: Create `src/ui/Fader.tsx`**

```tsx
import type { Readable } from "@audiorective/core";
import { useValue } from "@audiorective/react";

interface FaderProps {
  /** A volume Param (0..1). */
  param: Readable<number> & { value: number };
  height?: number;
}

/** Vertical volume fader. Writes the Param directly on input. */
export function Fader({ param, height = 80 }: FaderProps) {
  const v = useValue(param);
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={v}
      onChange={(e) => {
        param.value = Number(e.target.value);
      }}
      style={{
        writingMode: "vertical-lr",
        direction: "rtl",
        width: 18,
        height,
        accentColor: "#22d3ee",
      }}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/showroom/src/ui/Meter.tsx apps/showroom/src/ui/Fader.tsx
git commit -m "feat(showroom): Meter + Fader HUD primitives"
```

---

## Task 3: `ChannelStrip`

**Files:**

- Create: `apps/showroom/src/ui/ChannelStrip.tsx`

Compact strip for the selected channel: `PAN ▸` / `EQ ▸` headers (call back to open panels), `M`/`S` toggles, `Fader` + `Meter`, colored name.

- [ ] **Step 1: Create the file**

```tsx
import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { Channel } from "../audio/Channel";

interface Props {
  channel: Channel;
  onOpenEq: () => void;
  onOpenPanning: () => void;
}

export function ChannelStrip({ channel, onOpenEq, onOpenPanning }: Props) {
  const muted = useValue(channel.params.muted);
  const soloed = useValue(channel.params.soloed);

  return (
    <div style={{ ...strip, borderColor: channel.color }}>
      <div style={{ ...name, background: channel.color }}>{channel.label}</div>

      <button style={headerBtn} onClick={onOpenPanning}>
        PAN ▸ 3D
      </button>
      <button style={headerBtn} onClick={onOpenEq}>
        EQ ▸
      </button>

      <div style={{ display: "flex", gap: 4 }}>
        <button
          style={{ ...toggle, ...(muted ? { background: "#dc2626", color: "#fff" } : {}) }}
          onClick={() => {
            channel.params.muted.value = !muted;
          }}
        >
          M
        </button>
        <button
          style={{ ...toggle, ...(soloed ? { background: "#eab308", color: "#180c02" } : {}) }}
          onClick={() => {
            channel.params.soloed.value = !soloed;
          }}
        >
          S
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 4 }}>
        {/* Fader + Meter imported lazily below to keep this snippet focused */}
        <FaderMeter channel={channel} />
      </div>
    </div>
  );
}

// Local composition so the strip stays one file.
import { Fader } from "./Fader";
import { Meter } from "./Meter";
function FaderMeter({ channel }: { channel: Channel }) {
  return (
    <>
      <Fader param={channel.params.volume} height={110} />
      <Meter level={channel.cells.level} height={110} />
    </>
  );
}

const strip: CSSProperties = {
  width: 120,
  background: "rgba(8,10,18,0.9)",
  border: "1px solid",
  borderRadius: 6,
  padding: 8,
  color: "#cde",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  pointerEvents: "auto",
};
const name: CSSProperties = { textAlign: "center", borderRadius: 3, padding: "2px 0", color: "#06140a", fontWeight: 600 };
const headerBtn: CSSProperties = {
  background: "#0c0c16",
  border: "1px solid #22d3ee55",
  color: "#22d3ee",
  borderRadius: 3,
  padding: "4px 0",
  cursor: "pointer",
  font: "inherit",
};
const toggle: CSSProperties = {
  flex: 1,
  background: "#1a1a2e",
  border: "1px solid #ffffff22",
  color: "#9be",
  borderRadius: 3,
  padding: "3px 0",
  cursor: "pointer",
  font: "inherit",
};
```

> Note: keep the `import { Fader }`/`import { Meter }` lines at the top of the file when you actually write it (imports must precede usage). They're shown mid-file here only for readability.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/showroom/src/ui/ChannelStrip.tsx
git commit -m "feat(showroom): compact ChannelStrip"
```

---

## Task 4: `PanningScene` (three.js controller) + `PanningPanel`

**Files:**

- Create: `apps/showroom/src/panning/PanningScene.ts`
- Create: `apps/showroom/src/ui/PanningPanel.tsx`

Adapts `src/examples/sequencer/scene/SpatialScene.ts` (read it first) but **controller-only**: no `PannerAnchor`, no `THREE.AudioListener`. It reads each `channel.cells.position` to place dots and, on drag of the **selected** channel's dot, writes that channel's `position` cell (world x/z; y preserved). The widget footprint maps to the room's x/z extent.

- [ ] **Step 1: Create `src/panning/PanningScene.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/ui/PanningPanel.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { PanningScene } from "../panning/PanningScene";

export function PanningPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scene = new PanningScene();
    scene.mount(ref.current);
    return () => scene.dispose();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/showroom/src/panning/PanningScene.ts apps/showroom/src/ui/PanningPanel.tsx
git commit -m "feat(showroom): three.js panning controller (writes position cell)"
```

---

## Task 5: `EqScene` (three.js) + `EqPanel`

**Files:**

- Create: `apps/showroom/src/eq/EqScene.ts`
- Create: `apps/showroom/src/ui/EqPanel.tsx`

A minimal three.js EQ graph for the selected channel: three draggable nodes (low/mid/high) at fixed x, vertical drag = gain (−12..+12 dB) → writes `channel.eq.params.eqLow/eqMid/eqHigh`. Orthographic camera; a line connects the nodes.

- [ ] **Step 1: Create `src/eq/EqScene.ts`**

```ts
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
```

- [ ] **Step 2: Create `src/ui/EqPanel.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { EqScene } from "../eq/EqScene";

export function EqPanel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const scene = new EqScene();
    scene.mount(ref.current);
    return () => scene.dispose();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/showroom/src/eq/EqScene.ts apps/showroom/src/ui/EqPanel.tsx
git commit -m "feat(showroom): three.js EQ controller (writes eq params)"
```

---

## Task 6: `MixerPanel`

**Files:**

- Create: `apps/showroom/src/ui/MixerPanel.tsx`

Content-width compact mixer: per channel a narrow column (Fader + Meter + M/S + colored name) plus a master column. Hugs its content (does not span the screen).

- [ ] **Step 1: Create the file**

```tsx
import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";
import { Fader } from "./Fader";
import { Meter } from "./Meter";

function MiniStrip({ channel }: { channel: Channel }) {
  const muted = useValue(channel.params.muted);
  const soloed = useValue(channel.params.soloed);
  return (
    <div style={col}>
      <div style={{ display: "flex", gap: 4, height: 80 }}>
        <Fader param={channel.params.volume} height={80} />
        <Meter level={channel.cells.level} height={80} />
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
        <button style={{ ...mini, ...(muted ? { background: "#dc2626", color: "#fff" } : {}) }} onClick={() => (channel.params.muted.value = !muted)}>
          M
        </button>
        <button
          style={{ ...mini, ...(soloed ? { background: "#eab308", color: "#180c02" } : {}) }}
          onClick={() => (channel.params.soloed.value = !soloed)}
        >
          S
        </button>
      </div>
      <div style={{ ...tag, background: channel.color }}>{channel.label.slice(0, 4)}</div>
    </div>
  );
}

export function MixerPanel() {
  const masterVol = useValue(engine.mixer.params.masterVolume);
  return (
    <div style={panel}>
      {engine.channels.map((c) => (
        <MiniStrip key={c.id} channel={c} />
      ))}
      <div style={{ ...col, borderLeft: "1px solid #ffffff22", paddingLeft: 6 }}>
        <div style={{ display: "flex", gap: 4, height: 80 }}>
          <Fader param={engine.mixer.params.masterVolume} height={80} />
          <Meter level={engine.mixer.cells.masterLevel} height={80} />
        </div>
        <div style={{ ...tag, border: "1px solid #eab30855", color: "#eab308", marginTop: 18 }}>MST {Math.round(masterVol * 100)}</div>
      </div>
    </div>
  );
}

const panel: CSSProperties = {
  display: "inline-flex",
  gap: 6,
  padding: 8,
  background: "rgba(8,10,18,0.92)",
  border: "1px solid #22d3ee55",
  borderRadius: 6,
  pointerEvents: "auto",
  fontFamily: "system-ui, sans-serif",
};
const col: CSSProperties = { width: 34, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 9, color: "#9be" };
const mini: CSSProperties = {
  flex: 1,
  fontSize: 9,
  background: "#1a1a2e",
  border: "1px solid #ffffff22",
  color: "#9be",
  borderRadius: 2,
  cursor: "pointer",
};
const tag: CSSProperties = { marginTop: 3, width: "100%", textAlign: "center", borderRadius: 2, color: "#06140a", fontSize: 9 };
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/showroom/src/ui/MixerPanel.tsx
git commit -m "feat(showroom): content-width compact MixerPanel"
```

---

## Task 7: `PadPanel` (click + keyboard)

**Files:**

- Create: `apps/showroom/src/ui/PadPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { PAD_IDS, type PadId } from "../audio/sources/SamplerSource";
import { matchAction } from "../config/appConfig";

const PAD_BY_ACTION: Record<string, PadId> = { pad1: "boom", pad2: "riser", pad3: "airhorn", pad4: "applause" };

export function PadPanel() {
  // Keyboard triggers (pad1..pad4) — active whenever the pad panel is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAction(e);
      if (action && action in PAD_BY_ACTION) {
        e.preventDefault();
        engine.sampler?.trigger(PAD_BY_ACTION[action]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={grid}>
      {PAD_IDS.map((id) => (
        <button key={id} style={pad} onClick={() => engine.sampler?.trigger(id)}>
          {id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
  padding: 8,
  background: "rgba(8,10,18,0.9)",
  border: "1px solid #a855f755",
  borderRadius: 6,
  pointerEvents: "auto",
};
const pad: CSSProperties = {
  aspectRatio: "1.6",
  minWidth: 70,
  background: "#a855f733",
  border: "1px solid #a855f7",
  color: "#e9d5ff",
  borderRadius: 4,
  cursor: "pointer",
  font: "600 12px system-ui, sans-serif",
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/showroom/src/ui/PadPanel.tsx
git commit -m "feat(showroom): sampler PadPanel (click + keyboard)"
```

---

## Task 8: `ChannelMenu`

**Files:**

- Create: `apps/showroom/src/ui/ChannelMenu.tsx`

- [ ] **Step 1: Create the file**

```tsx
import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";

interface Props {
  onSelectChannel: (id: string) => void;
  onOpenMixer: () => void;
  activeView: { kind: "channel"; id: string } | { kind: "mixer" } | { kind: "none" };
}

export function ChannelMenu({ onSelectChannel, onOpenMixer, activeView }: Props) {
  const selected = useValue(engine.selectedChannelId);
  return (
    <div style={menu}>
      <div style={heading}>DRONES</div>
      <div style={rule} />
      {engine.channels.map((c) => {
        const active = activeView.kind === "channel" && activeView.id === c.id;
        return (
          <button
            key={c.id}
            style={{ ...row, ...(active || selected === c.id ? { background: `${c.color}33`, borderLeft: `2px solid ${c.color}` } : {}) }}
            onClick={() => onSelectChannel(c.id)}
          >
            {c.label}
          </button>
        );
      })}
      <div style={rule} />
      <button style={{ ...row, color: "#eab308", ...(activeView.kind === "mixer" ? { background: "#eab30822" } : {}) }} onClick={onOpenMixer}>
        Mixer
      </button>
    </div>
  );
}

const menu: CSSProperties = {
  width: 110,
  background: "rgba(8,10,18,0.82)",
  border: "1px solid #22d3ee44",
  borderRadius: 6,
  padding: 7,
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  color: "#9be",
  pointerEvents: "auto",
};
const heading: CSSProperties = { color: "#22d3ee", letterSpacing: 1, fontSize: 10 };
const rule: CSSProperties = { borderBottom: "1px solid #22d3ee33", margin: "4px 0" };
const row: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderLeft: "2px solid transparent",
  color: "inherit",
  padding: "3px 4px",
  cursor: "pointer",
  font: "inherit",
};
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

```bash
git add apps/showroom/src/ui/ChannelMenu.tsx
git commit -m "feat(showroom): ChannelMenu (drone list + Mixer entry)"
```

---

## Task 9: `Hud` orchestration + wire into `App`

**Files:**

- Create: `apps/showroom/src/ui/Hud.tsx`
- Modify: `apps/showroom/src/ui/App.tsx`

`Hud` owns React-local panel state, mirrors open/closed into `engine.ui.hudOpen` (shared, for pointer-lock), wires `toggleHud`/`toggleHeadphone` via the keymap, and renders the menu + active panel + the always-visible Phones/Hide cluster.

- [ ] **Step 1: Create `src/ui/Hud.tsx`**

```tsx
import { useEffect, useState, type CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { matchAction } from "../config/appConfig";
import { ChannelMenu } from "./ChannelMenu";
import { ChannelStrip } from "./ChannelStrip";
import { EqPanel } from "./EqPanel";
import { PanningPanel } from "./PanningPanel";
import { MixerPanel } from "./MixerPanel";
import { PadPanel } from "./PadPanel";

type View = { kind: "none" } | { kind: "channel"; id: string } | { kind: "eq"; id: string } | { kind: "panning"; id: string } | { kind: "mixer" };

export function Hud() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "none" });
  const headphone = useValue(engine.mixer.params.headphone);

  // Mirror HUD visibility into shared engine state (scene reads it for pointer-lock).
  useEffect(() => {
    engine.ui.update((d) => {
      d.hudOpen = open;
    });
  }, [open]);

  // Global keys: toggle HUD, toggle headphone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAction(e);
      if (action === "toggleHud") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (action === "toggleHeadphone") {
        e.preventDefault();
        engine.mixer.params.headphone.value = !engine.mixer.params.headphone.value;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectChannel = (id: string) => {
    engine.selectedChannelId.value = id;
    setView({ kind: "channel", id });
    setOpen(true);
  };

  return (
    <>
      {/* Always-visible top-right cluster */}
      <div style={cluster}>
        <button
          style={{ ...chip, ...(headphone ? { background: "rgba(234,179,8,0.3)", color: "#fff" } : {}) }}
          onClick={() => (engine.mixer.params.headphone.value = !headphone)}
        >
          🎧 Phones
        </button>
        <button style={chip} onClick={() => setOpen((o) => !o)}>
          {open ? "✕ Hide" : "☰ Mix"}
        </button>
      </div>

      {open && (
        <>
          {/* Bottom-left menu */}
          <div style={menuSlot}>
            <ChannelMenu
              activeView={view.kind === "channel" ? { kind: "channel", id: view.id } : view.kind === "mixer" ? { kind: "mixer" } : { kind: "none" }}
              onSelectChannel={selectChannel}
              onOpenMixer={() => setView({ kind: "mixer" })}
            />
          </div>

          {/* Active panel */}
          {view.kind === "channel" && (
            <div style={stripSlot}>
              <ChannelStrip
                channel={engine.channels.find((c) => c.id === view.id)!}
                onOpenEq={() => setView({ kind: "eq", id: view.id })}
                onOpenPanning={() => setView({ kind: "panning", id: view.id })}
              />
            </div>
          )}
          {view.kind === "eq" && (
            <div style={bigPanel}>
              <PanelHeader title="EQ" onBack={() => setView({ kind: "channel", id: view.id })} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <EqPanel />
              </div>
            </div>
          )}
          {view.kind === "panning" && (
            <div style={bigPanel}>
              <PanelHeader title="Panning" onBack={() => setView({ kind: "channel", id: view.id })} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <PanningPanel />
              </div>
            </div>
          )}
          {view.kind === "mixer" && (
            <div style={mixerSlot}>
              <MixerPanel />
            </div>
          )}

          {/* Sampler pads (always available while HUD is open) */}
          <div style={padSlot}>
            <PadPanel />
          </div>
        </>
      )}
    </>
  );
}

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ color: "#22d3ee", fontSize: 12 }}>{title}</span>
      <button style={chip} onClick={onBack}>
        ◀ Back
      </button>
    </div>
  );
}

const base: CSSProperties = { position: "fixed", fontFamily: "system-ui, sans-serif", pointerEvents: "none" };
const cluster: CSSProperties = { ...base, top: 12, right: 12, display: "flex", gap: 6, pointerEvents: "auto" };
const chip: CSSProperties = {
  background: "rgba(8,10,18,0.82)",
  border: "1px solid #22d3ee44",
  color: "#9be",
  borderRadius: 5,
  padding: "5px 9px",
  fontSize: 12,
  cursor: "pointer",
};
const menuSlot: CSSProperties = { ...base, left: 12, bottom: 12, pointerEvents: "auto" };
const stripSlot: CSSProperties = { ...base, left: 130, bottom: 12, pointerEvents: "auto" };
const bigPanel: CSSProperties = {
  ...base,
  left: "50%",
  top: "50%",
  transform: "translate(-50%,-50%)",
  width: "min(60vw, 560px)",
  height: "min(50vh, 360px)",
  background: "rgba(8,10,18,0.9)",
  border: "1px solid #22d3ee66",
  borderRadius: 8,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  pointerEvents: "auto",
};
const mixerSlot: CSSProperties = { ...base, left: 130, bottom: 12, pointerEvents: "auto" };
const padSlot: CSSProperties = { ...base, right: 12, bottom: 12, pointerEvents: "auto" };
```

- [ ] **Step 2: Add `<Hud />` to `src/ui/App.tsx`**

Add the import and render it after `SceneHost` (keep the existing `Hint`):

```tsx
import { Hud } from "./Hud";
```

In the returned tree, add `<Hud />` after `<SceneHost />`:

```tsx
<EngineProvider>
  <SceneHost />
  <Hud />
  <Hint />
</EngineProvider>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/showroom/src/ui/Hud.tsx apps/showroom/src/ui/App.tsx
git commit -m "feat(showroom): HUD orchestration (menu, panels, headphone, keymap)"
```

---

## Task 10: Relocate reused modules out of `examples/`

Move the three reused files into `src/audio/` and update Phase 1/2 imports, so the next task can delete `examples/` cleanly.

**Files:**

- Move: `src/examples/sequencer/audio/instruments/StepSynth.ts` → `src/audio/instruments/StepSynth.ts`
- Move: `src/examples/sequencer/audio/MasterSequencer.ts` → `src/audio/MasterSequencer.ts`
- Keep `src/shared/audio/EQ3.ts` where it is (still under `shared/`, not `examples/`) — no move needed; only `examples/` is deleted.
- Modify imports in: `src/audio/sources/SynthSource.ts`, `src/audio/engine.ts`

- [ ] **Step 1: Move the files with git**

```bash
mkdir -p apps/showroom/src/audio/instruments
git mv apps/showroom/src/examples/sequencer/audio/instruments/StepSynth.ts apps/showroom/src/audio/instruments/StepSynth.ts
git mv apps/showroom/src/examples/sequencer/audio/MasterSequencer.ts apps/showroom/src/audio/MasterSequencer.ts
```

- [ ] **Step 2: Fix imports in `src/audio/sources/SynthSource.ts`**

Change the two import lines to the new locations:

```ts
import { StepSynth } from "../instruments/StepSynth";
import type { MasterSequencer } from "../MasterSequencer";
```

- [ ] **Step 3: Fix the import in `src/audio/engine.ts`**

Change:

```ts
import { MasterSequencer } from "./MasterSequencer";
```

- [ ] **Step 4: Fix the import in `tests/synthSource.test.ts`**

Change the MasterSequencer import to:

```ts
import { MasterSequencer } from "../src/audio/MasterSequencer";
```

- [ ] **Step 5: Run the audio suite + typecheck**

Run: `pnpm --filter @audiorective/showroom test -- --run synthSource engine`
Expected: PASS.
Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors. (`examples/` still imports its own copies elsewhere — that whole tree is deleted next task.)

- [ ] **Step 6: Commit**

```bash
git add apps/showroom/src/audio/instruments/StepSynth.ts apps/showroom/src/audio/MasterSequencer.ts apps/showroom/src/audio/sources/SynthSource.ts apps/showroom/src/audio/engine.ts apps/showroom/tests/synthSource.test.ts
git commit -m "refactor(showroom): relocate StepSynth + MasterSequencer into src/audio"
```

---

## Task 11: Delete the old demos + single-page Vite + docs

**Files:**

- Delete: `src/examples/`, `src/App.tsx`, `src/shared/audio/MusicPlayer.ts`, and the `sequencer/`, `spatial-room/`, `spatial-room-playcanvas/` html-entry folders
- Modify: `vite.config.ts`, `README.md`, `docs` examples references, `src/examples/registry.ts` removal

- [ ] **Step 1: Delete the old code + entries**

```bash
git rm -r apps/showroom/src/examples
git rm apps/showroom/src/App.tsx
git rm apps/showroom/src/shared/audio/MusicPlayer.ts
git rm -r apps/showroom/sequencer apps/showroom/spatial-room apps/showroom/spatial-room-playcanvas
```

- [ ] **Step 2: Simplify `apps/showroom/vite.config.ts` to single-page**

Replace the whole file with:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 3: Confirm nothing still imports deleted files**

Run: `pnpm --filter @audiorective/showroom typecheck`
Expected: no errors. If any import error points at `examples/`, `MusicPlayer`, or the old picker, fix that import (it should only be the files this plan created, which already use the relocated/`shared` paths).

- [ ] **Step 4: Build**

Run: `pnpm --filter @audiorective/showroom build`
Expected: builds successfully (single `index.html`).

- [ ] **Step 5: Update `README.md` Examples section**

Replace the three-bullet "Examples" list (Step Sequencer / Spatial Music Room / Spatial Music Room PlayCanvas) under `[apps/showroom](./apps/showroom)` with a single entry describing the PA simulator, e.g.:

```md
[apps/showroom](./apps/showroom) — **Livehouse PA Simulator**, one app built with `@audiorective/core`, `@audiorective/react`, `@audiorective/playcanvas`, and three.js: you're the PA tech in a cyber livehouse. Six audio drones (StreamPlayer stems, a synth, and a SoundPlayer sampler) fly in a PlayCanvas world; walk around to hear the spatial mix shift, mix each channel (EQ / volume / solo / mute / 3D pan) from a React iPad HUD, fire the sampler pads, and hit Headphone to monitor a dry stereo mixdown. Demonstrates the full stack: one `AudioContext`, three renderers, zero duplicated audio state.
```

- [ ] **Step 6: Commit**

```bash
git add -A apps/showroom README.md
git commit -m "feat(showroom): replace the three demos with the Livehouse PA Simulator"
```

---

## Task 12: Manual verification checkpoint

> Implementer does not start the dev server — ask the user.

- [ ] **Step 1: Ask the user to run `pnpm --filter @audiorective/showroom dev`** and provide the URL.

- [ ] **Step 2: Verify via chrome-devtools MCP (screenshot + console eval):**
- World renders (Phase 2 still works), audio starts on first click.
- `☰ Mix` (top-right) opens the HUD; `✕ Hide` / `Tab` closes it; while open, mouse-look is released (HUD usable).
- Bottom-left menu lists the six drones + Mixer. Selecting a drone shows its channel strip; the same drone highlights in the world (`selectedChannelId`).
- Channel strip: fader changes volume; meter moves with audio; `M` mutes only that channel; `S` solos (others drop); `[EQ]` opens the three.js EQ (drag a node → tone changes); `[Panning]` opens the three.js widget (drag the dot → the world drone moves and panning shifts).
- `[Mixer]` shows the compact content-width mixer with all faders/meters + master.
- Pads fire one-shots on click and on the keyboard pad keys; the sampler bed loops (once assets are provided).
- `🎧 Phones` toggles the dry stereo mixdown (spatial/room ambience drops); `H` does the same.

- [ ] **Step 3: Record results.** No commit (verification only).

---

## Self-Review notes (for the implementer)

- **Spec coverage (§5.2, §5.3, §5.4):** toggleable semi-transparent HUD ✓; bottom-left menu → channel strip → `[EQ]`/`[Panning]` panels (three.js) ✓; `[Mixer]` content-width ✓; pads (click+keyboard) ✓; Phones+Hide top-right ✓; configurable keymap ✓; old demos replaced ✓ (§ decision 7).
- **State ownership:** `engine.ui.hudOpen` is shared (scene reads it); panel routing is React-local; `selectedChannelId` shared; EQ/volume/mute/solo/position all live on engine processors — UI only reads/writes via `useValue`/`.value`. The three.js widgets are controllers (no audio nodes / no `THREE.AudioListener`).
- **Type consistency:** consumes Phase 1 (`engine.channels`, `channel.params.{volume,muted,soloed}`, `channel.cells.{position,level}`, `channel.eq.params.{eqLow,eqMid,eqHigh}`, `engine.mixer.params.{headphone,masterVolume}`, `engine.mixer.cells.masterLevel`, `engine.sampler.trigger`, `PAD_IDS`/`PadId`) and Phase 2 (`engine.ui.hudOpen`, `selectedChannelId`). `matchAction` (Task 1) used by Tasks 7 + 9.
- **Reference:** `src/examples/sequencer/scene/SpatialScene.ts` is the template for `PanningScene` — but remove the `PannerAnchor`/`AudioListener` coupling (the widget writes the `position` cell instead).
- **Phase 4 remains:** the "Designing Audio Apps" skill guide (spec §11), authored with `superpowers:writing-skills`.

```

```
