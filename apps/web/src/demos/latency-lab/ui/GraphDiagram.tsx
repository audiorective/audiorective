import { useMemo } from "react";
import { useValue } from "@audiorective/react";
import type { GraphSnapshot } from "@audiorective/core";
import { useEngine } from "../audio/engine";

type Role = "beat" | "click" | "split" | "limiter" | "dry" | "master" | "destination";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fixed per-role layout — the graph's shape never changes, only which edges are live. */
const POS: Record<Role, Box> = {
  beat: { x: 16, y: 20, w: 84, h: 40 },
  click: { x: 16, y: 180, w: 84, h: 40 },
  split: { x: 160, y: 100, w: 72, h: 40 },
  limiter: { x: 300, y: 16, w: 110, h: 48 },
  dry: { x: 300, y: 180, w: 72, h: 40 },
  master: { x: 480, y: 100, w: 84, h: 40 },
  destination: { x: 620, y: 100, w: 96, h: 40 },
};

const ROLE_LABEL: Record<Role, string> = {
  beat: "Beat",
  click: "Click",
  split: "split",
  limiter: "Limiter",
  dry: "dry",
  master: "master",
  destination: "destination",
};

function center(box: Box): { x: number; y: number } {
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

// Point on `box`'s border in the direction of `to` — arrows start/end at the
// rect edge, not its center, so they don't run under the label.
function edgePoint(box: Box, to: { x: number; y: number }): { x: number; y: number } {
  const c = center(box);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scaleX = dx !== 0 ? box.w / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? box.h / 2 / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

export function GraphDiagram() {
  const { core, lab } = useEngine();
  // Re-read the snapshot on every solve — `solveTick` is bumped from `Lab`'s
  // `onSolve` callback, which fires after PDC toggles, bypass toggles, and
  // attach().
  useValue(lab.solveTick);
  const snapshot: GraphSnapshot = lab.snapshot();
  const roles = lab.roles();
  const pdcEnabled = useValue(lab.pdcEnabled);
  const latency = useValue(core.latency);

  const { nodes, edges } = useMemo(() => {
    const audioEdges = snapshot.edges.filter((e) => e.kind === "audio");
    const nodeById = new Map(snapshot.nodes.map((n) => [n.id, n]));
    const present = new Set<number>();
    for (const e of audioEdges) {
      present.add(e.from);
      present.add(e.to);
    }
    const nodes = [...present]
      .map((id) => {
        const role = roles.get(id) as Role | undefined;
        if (!role) return null;
        return { id, role, snapshot: nodeById.get(id) };
      })
      .filter((n): n is { id: number; role: Role; snapshot: GraphSnapshot["nodes"][number] | undefined } => n !== null);

    const incomingCount = new Map<number, number>();
    for (const e of audioEdges) incomingCount.set(e.to, (incomingCount.get(e.to) ?? 0) + 1);

    const edges = audioEdges
      .map((e) => {
        const fromRole = roles.get(e.from) as Role | undefined;
        const toRole = roles.get(e.to) as Role | undefined;
        if (!fromRole || !toRole) return null;
        return { ...e, fromRole, toRole, joinArrival: (incomingCount.get(e.to) ?? 0) > 1 ? (nodeById.get(e.to)?.arrival ?? 0) : undefined };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return { nodes, edges };
  }, [snapshot, roles]);

  const sampleRate = core.context.sampleRate;
  const latencyMs = (latency / sampleRate) * 1000;
  // Read fresh on every render — cheapest way to keep it current without a
  // requestAnimationFrame loop, since a render already happens on every solve
  // (`solveTick` above) and every latency/PDC change.
  const perceivedTime = core.perceivedTime;

  return (
    <div className="diagram">
      <div className="diagram__header">
        engine.latency: {latency} samples ({latencyMs.toFixed(1)} ms) · perceived: {perceivedTime.toFixed(3)} s · PDC {pdcEnabled ? "on" : "off"}
      </div>
      <svg className="diagram__svg" viewBox="0 0 760 240" role="img" aria-label="Audio graph diagram">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--diagram-edge)" />
          </marker>
        </defs>

        {edges.map((e) => {
          const from = POS[e.fromRole];
          const to = POS[e.toRole];
          const p1 = edgePoint(from, center(to));
          const p2 = edgePoint(to, center(from));
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          return (
            <g key={`${e.from}-${e.to}-${e.label ?? ""}`}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--diagram-edge)" strokeWidth={1.5} markerEnd="url(#arrow)" />
              {e.label && (
                <text x={mid.x} y={mid.y - 14} className="diagram__edge-label" textAnchor="middle">
                  {e.label}
                </text>
              )}
              {e.compensationSamples > 0 && (
                <text x={mid.x} y={mid.y + (e.label ? 2 : -4)} className="diagram__badge" textAnchor="middle">
                  ⏱ {e.compensationSamples}
                </text>
              )}
              {e.joinArrival !== undefined && (
                <text x={p2.x} y={p2.y + 14} className="diagram__arrival" textAnchor="middle">
                  arr {e.joinArrival}
                </text>
              )}
            </g>
          );
        })}

        {nodes.map(({ id, role, snapshot: n }) => {
          const box = POS[role];
          const isProcessor = n?.kind === "processor";
          return (
            <g key={id}>
              <rect
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                rx={6}
                className={`diagram__node${isProcessor ? " diagram__node--processor" : ""}`}
              />
              <text
                x={box.x + box.w / 2}
                y={box.y + box.h / 2 - (isProcessor ? 6 : 0)}
                textAnchor="middle"
                dominantBaseline="middle"
                className="diagram__node-label"
              >
                {ROLE_LABEL[role]}
              </text>
              {isProcessor && (
                <text
                  x={box.x + box.w / 2}
                  y={box.y + box.h / 2 + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="diagram__node-latency"
                >
                  {n.latency} smp
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
