import { Application, Container, Graphics, Text } from "pixi.js";
import { effect } from "alien-signals";
import { engine } from "./audio/engine";

const { synth, analyser } = engine;

declare global {
  interface Window {
    __engine?: typeof engine;
  }
}
if (typeof window !== "undefined") window.__engine = engine;

const BAR_GAP = 2;
const MIN_CUTOFF = 80;
const MAX_CUTOFF = 8000;

async function main(): Promise<void> {
  const app = new Application();
  await app.init({ background: "#0a0a12", resizeTo: window, antialias: true });
  document.getElementById("app")!.appendChild(app.canvas);

  // ── Boot: the ONLY lifecycle glue. autoStart already lives in core; it arms a
  // one-shot gesture listener on the canvas and resumes the AudioContext. There
  // is no PixiJS audio subsystem to reconcile, so this is the whole story.
  const detachAutoStart = engine.core.autoStart(app.canvas);

  const disposers: Array<() => void> = [detachAutoStart];

  // ─────────────────────────────────────────────────────────────────────────
  // Audio → visual (per-frame poll): the spectrum is NOT reactive — analyser
  // bytes change every audio frame with no signal to subscribe to. So we read
  // it in the ticker, the same place three.js/playcanvas read transforms.
  // ─────────────────────────────────────────────────────────────────────────
  const bins = analyser.binCount;
  const spectrum = analyser.createFrequencyBuffer();
  const bars = new Graphics();
  app.stage.addChild(bars);

  app.ticker.add(() => {
    analyser.readFrequencies(spectrum);
    const w = app.screen.width;
    const h = app.screen.height;
    const barW = w / bins;
    bars.clear();
    for (let i = 0; i < bins; i++) {
      const mag = spectrum[i]! / 255;
      const barH = mag * h * 0.7;
      bars.rect(i * barW, h - barH, barW - BAR_GAP, barH).fill({ h: 200 + mag * 120, s: 80, l: 45 + mag * 25 });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Audio → visual (signal-driven): the puck glow follows level. This IS
  // reactive (level is a Param), so a plain alien-signals effect mutates the
  // display object directly — no ticker, no useValue, no Pixi adapter.
  // ─────────────────────────────────────────────────────────────────────────
  const puck = new Container();
  const glow = new Graphics().circle(0, 0, 34).fill({ color: 0x66ccff, alpha: 0.9 });
  puck.addChild(glow);
  app.stage.addChild(puck);
  puck.position.set(app.screen.width * 0.5, app.screen.height * 0.5);

  disposers.push(
    effect(() => {
      const v = synth.params.level.$();
      glow.scale.set(0.6 + v * 0.9);
      glow.alpha = 0.35 + v * 0.6;
    }),
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Visual → audio: drag the puck. x → cutoff, y → level. Plain pointer handlers
  // writing `.value` — direct mutation, no dispatch. Note `level` (UI-owned) is a
  // different param from `gate` (the ramped envelope), so this continuous write
  // never fights setActive()'s ramp — see the Gotcha in docs/pixijs.md.
  // ─────────────────────────────────────────────────────────────────────────
  puck.eventMode = "static";
  puck.cursor = "grab";
  let dragging = false;
  let dragOccurred = false; // distinguishes a drag from a tap (pointerup precedes pointertap)

  const writeFromPointer = (x: number, y: number): void => {
    const w = app.screen.width;
    const h = app.screen.height;
    const nx = Math.max(0, Math.min(1, x / w));
    const ny = Math.max(0, Math.min(1, y / h));
    synth.params.cutoff.value = MIN_CUTOFF + nx * (MAX_CUTOFF - MIN_CUTOFF);
    synth.params.level.value = 1 - ny; // top = loud
    puck.position.set(x, y);
  };

  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  // Reset on the STAGE pointerdown so it fires at the start of every gesture —
  // puck presses (events bubble child→parent) and bare-stage taps alike.
  // Resetting only in puck's handler would leave the flag stale after a drag,
  // suppressing later empty-stage taps.
  app.stage.on("pointerdown", () => {
    dragOccurred = false;
  });
  puck.on("pointerdown", () => {
    dragging = true;
    puck.cursor = "grabbing";
  });
  app.stage.on("pointermove", (e) => {
    if (!dragging) return;
    dragOccurred = true;
    writeFromPointer(e.global.x, e.global.y);
  });
  const stopDrag = (): void => {
    dragging = false;
    puck.cursor = "grab";
  };
  app.stage.on("pointerup", stopDrag);
  app.stage.on("pointerupoutside", stopDrag);

  // ─────────────────────────────────────────────────────────────────────────
  // Start/stop the drone on tap (after the gesture resumes audio). Guard on
  // `dragOccurred`, not `dragging` — by the time pointertap fires, pointerup has
  // already reset `dragging`, so a short puck drag would otherwise toggle too.
  // ─────────────────────────────────────────────────────────────────────────
  let active = false;
  app.stage.on("pointertap", () => {
    if (dragOccurred) return;
    active = !active;
    synth.setActive(active);
  });

  const hint = new Text({
    text: "click to start the drone · drag the puck (→ cutoff, ↑ level)",
    style: { fill: 0x8899aa, fontSize: 14, fontFamily: "monospace" },
  });
  hint.position.set(12, 12);
  app.stage.addChild(hint);

  window.addEventListener("beforeunload", () => {
    for (const d of disposers) d();
    engine.core.destroy();
    app.destroy(true);
  });
}

void main();
