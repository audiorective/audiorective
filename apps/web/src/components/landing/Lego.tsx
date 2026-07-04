import { useEffect, useRef } from "react";
import { assembleShape, pickPiles } from "./legoScene";

const PIECES_PER_LOOP = 4;
const PILE_POSITIONS = [
  { x: -0.82, y: -0.55 },
  { x: -0.3, y: -0.7 },
  { x: 0.3, y: -0.65 },
  { x: 0.8, y: -0.5 },
  { x: -0.6, y: 0.65 },
  { x: 0.6, y: 0.7 },
];

const BRICK_COLORS = ["#8b7cf6", "#6ea8fe", "#f6ad55", "#68d391", "#fc8181", "#63b3ed"];

// Loop phases, as fractions of LOOP_MS. Idle gives the piles a calm beat
// before a piece breaks away; drift/settle/ship read as one continuous
// snap-together-and-glide gesture; hold lets the finished shape rest before
// the next loop's piles take over.
const LOOP_MS = 9000;
const PHASE_IDLE = 0.12;
const PHASE_DRIFT = 0.45;
const PHASE_SETTLE = 0.72;
const PHASE_HOLD = 0.92;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function usePrefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Faux-2.5D: pieces higher on screen (smaller y) sit "further back" — slightly smaller and dimmer. */
function drawBrick(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, depth: number) {
  const scale = 0.75 + 0.25 * depth;
  const w = size * scale;
  const h = size * 0.62 * scale;
  const shade = 0.55 + 0.45 * depth;

  ctx.save();
  ctx.translate(x, y);

  // drop shadow, grounds the brick on the baseplate
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.6, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = color;
  ctx.globalAlpha = shade;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 3);
  ctx.fill();

  // top highlight for a 2.5D "raised stud" feel
  ctx.globalAlpha = shade * 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.28, 2);
  ctx.fill();

  ctx.restore();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export default function Lego() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    let width = 0;
    let height = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const toScreen = (x: number, y: number) => ({
      x: width / 2 + x * (width / 2) * 0.85,
      y: height / 2 + y * (height / 2) * 0.85,
    });

    function renderFrame(now: number) {
      ctx.clearRect(0, 0, width, height);

      const loopIndex = Math.floor(now / LOOP_MS);
      const t = (now % LOOP_MS) / LOOP_MS;
      const piles = pickPiles(loopIndex, PIECES_PER_LOOP);
      const targets = assembleShape(piles);

      // Idle: piles sit at rest.
      if (t < PHASE_IDLE) {
        piles.forEach((pileIndex) => {
          const pos = PILE_POSITIONS[pileIndex % PILE_POSITIONS.length];
          const screen = toScreen(pos.x, pos.y);
          drawBrick(ctx, screen.x, screen.y, 34, BRICK_COLORS[pileIndex % BRICK_COLORS.length], 0.5);
        });
        return;
      }

      // Drift: each piece eases from its pile toward its assembled target.
      if (t < PHASE_DRIFT) {
        const localT = easeInOutCubic((t - PHASE_IDLE) / (PHASE_DRIFT - PHASE_IDLE));
        piles.forEach((pileIndex, i) => {
          const from = PILE_POSITIONS[pileIndex % PILE_POSITIONS.length];
          const to = targets[i];
          const x = lerp(from.x, to.x, localT);
          const y = lerp(from.y, to.y, localT) - Math.sin(localT * Math.PI) * 0.12; // faux-2.5D arc lift
          const screen = toScreen(x, y);
          const depth = 0.5 + 0.5 * localT;
          drawBrick(ctx, screen.x, screen.y, 34, BRICK_COLORS[pileIndex % BRICK_COLORS.length], depth);
        });
        return;
      }

      // Settle: bricks click into their final assembled positions, a slight overshoot for "snap".
      if (t < PHASE_SETTLE) {
        const localT = (t - PHASE_DRIFT) / (PHASE_SETTLE - PHASE_DRIFT);
        const overshoot = 1 + Math.sin(localT * Math.PI) * 0.06 * (1 - localT);
        piles.forEach((pileIndex, i) => {
          const to = targets[i];
          const screen = toScreen(to.x * overshoot, to.y * overshoot);
          drawBrick(ctx, screen.x, screen.y, 34, BRICK_COLORS[pileIndex % BRICK_COLORS.length], 1);
        });
        return;
      }

      // Ship: the assembled shape glides off and fades — "shipped".
      if (t < PHASE_HOLD) {
        const localT = easeInOutCubic((t - PHASE_SETTLE) / (PHASE_HOLD - PHASE_SETTLE));
        const driftX = localT * 0.9;
        const alpha = 1 - localT;
        ctx.globalAlpha = alpha;
        piles.forEach((pileIndex, i) => {
          const to = targets[i];
          const screen = toScreen(to.x + driftX, to.y - localT * 0.15);
          drawBrick(ctx, screen.x, screen.y, 34, BRICK_COLORS[pileIndex % BRICK_COLORS.length], 1);
        });
        ctx.globalAlpha = 1;
        return;
      }

      // Hold: brief empty baseplate before the next loop's piles fade in.
    }

    if (reducedMotion) {
      // Render a single settled frame: assembled shape, fully formed, no motion.
      const piles = pickPiles(0, PIECES_PER_LOOP);
      const targets = assembleShape(piles);
      ctx.clearRect(0, 0, width, height);
      piles.forEach((pileIndex, i) => {
        const to = targets[i];
        const screen = toScreen(to.x, to.y);
        drawBrick(ctx, screen.x, screen.y, 34, BRICK_COLORS[pileIndex % BRICK_COLORS.length], 1);
      });
      return () => window.removeEventListener("resize", resize);
    }

    let rafId = 0;
    const tick = (now: number) => {
      renderFrame(now);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [reducedMotion]);

  return <canvas ref={canvasRef} className="lego-canvas" style={{ width: "100%", height: "100%", display: "block" }} />;
}
