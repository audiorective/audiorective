import { Application, Graphics } from "pixi.js";
import { effect } from "alien-signals";
import type { LandingEngine } from "./setup";
import { padToParams, paramsToPad } from "./padCoordinates";

export async function mountPad(host: HTMLElement, engine: LandingEngine) {
  const app = new Application();
  await app.init({ backgroundAlpha: 0, resizeTo: host, antialias: true, preference: "webgl" });
  host.appendChild(app.canvas);
  app.canvas.setAttribute("aria-hidden", "true");
  const graph = new Graphics();
  app.stage.addChild(graph);
  const spectrum = engine.analyser.createFrequencyBuffer();
  let x = 0;
  let y = 0;
  const dispose = effect(() => {
    const point = paramsToPad(engine.filter.params.frequency.value, engine.delay.params.wet.value);
    x = point.x;
    y = point.y;
  });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const draw = () => {
    const { width: w, height: h } = app.screen;
    graph.clear();
    for (let i = 1; i < 4; i++) {
      graph
        .moveTo((w * i) / 4, 0)
        .lineTo((w * i) / 4, h)
        .stroke({ color: 0x454a46, width: 1 });
      graph
        .moveTo(0, (h * i) / 4)
        .lineTo(w, (h * i) / 4)
        .stroke({ color: 0x454a46, width: 1 });
    }
    if (!reducedMotion.matches) {
      engine.analyser.readFrequencies(spectrum);
      spectrum.forEach((v, i) =>
        graph
          .rect((i * w) / spectrum.length, h - (v / 255) * h * 0.6, Math.max(1, w / spectrum.length - 2), (v / 255) * h * 0.6)
          .fill({ color: 0x8dbda8, alpha: 0.45 }),
      );
    }
    graph
      .moveTo(x * (w - 16) + 8, 0)
      .lineTo(x * (w - 16) + 8, h)
      .stroke({ color: 0xf4af53, alpha: 0.5, width: 1 });
    graph
      .moveTo(0, y * (h - 16) + 8)
      .lineTo(w, y * (h - 16) + 8)
      .stroke({ color: 0xf4af53, alpha: 0.5, width: 1 });
    graph.circle(x * (w - 16) + 8, y * (h - 16) + 8, 7).fill(0xf4af53);
  };
  app.ticker.add(draw);
  let pointer: number | null = null;
  const write = (event: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    const params = padToParams((event.clientX - rect.left - 8) / (rect.width - 16), (event.clientY - rect.top - 8) / (rect.height - 16));
    engine.filter.params.frequency.value = params.frequency;
    engine.delay.params.wet.value = params.wet;
  };
  const down = (event: PointerEvent) => {
    pointer = event.pointerId;
    app.canvas.setPointerCapture(pointer);
    write(event);
  };
  const move = (event: PointerEvent) => {
    if (pointer === event.pointerId) write(event);
  };
  const up = () => {
    pointer = null;
  };
  app.canvas.addEventListener("pointerdown", down);
  app.canvas.addEventListener("pointermove", move);
  app.canvas.addEventListener("pointerup", up);
  app.canvas.addEventListener("pointercancel", up);
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) app.start();
    else app.stop();
  });
  observer.observe(host);
  return () => {
    observer.disconnect();
    dispose();
    app.canvas.removeEventListener("pointerdown", down);
    app.canvas.removeEventListener("pointermove", move);
    app.canvas.removeEventListener("pointerup", up);
    app.canvas.removeEventListener("pointercancel", up);
    app.destroy(true);
  };
}
