import { useEffect, useRef, useState } from "react";

const LOOP_MS = 4000;
const UI_TARGET_LOW = 0.2;
const UI_TARGET_HIGH = 0.8;
const SYNC_START = 0.6;
const SYNC_END = 0.85;

export interface DesyncState {
  ui: number;
  audio: number;
  syncing: boolean;
}

/**
 * Pure model of the "state owned twice" desync story, driven by loop phase `t` (0..1):
 * - the UI value jumps to a new target at t=0 (slider move)
 * - the audio value holds the previous target (stale) until the sync window
 * - during the sync window it ramps to meet the UI value; after it, both match
 */
export function computeDesync(t: number): DesyncState {
  const phase = ((t % 1) + 1) % 1;

  // Alternate the UI target each loop so the jump is visible: even loops jump
  // low->high, odd loops jump high->low. We only render one loop's worth of
  // phase, so within [0,1) ui always jumps from the previous target to the
  // "current" target at phase 0.
  const previousTarget = UI_TARGET_LOW;
  const currentTarget = UI_TARGET_HIGH;

  const ui = currentTarget;

  let audio: number;
  let syncing: boolean;
  if (phase < SYNC_START) {
    audio = previousTarget;
    syncing = false;
  } else if (phase < SYNC_END) {
    const progress = (phase - SYNC_START) / (SYNC_END - SYNC_START);
    audio = previousTarget + (currentTarget - previousTarget) * progress;
    syncing = true;
  } else {
    audio = currentTarget;
    syncing = false;
  }

  return { ui, audio, syncing };
}

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(query.matches);
    const listener = (event: MediaQueryListEvent) => setPrefers(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return prefers;
}

function useLoopPhase(): number {
  const prefersReducedMotion = usePrefersReducedMotion();
  // Hold on a frame that clearly shows the desync (mid-window, pre-sync) when
  // motion is reduced, rather than animating.
  const [phase, setPhase] = useState(0.3);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase(0.3);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = (now - start) % LOOP_MS;
      setPhase(elapsed / LOOP_MS);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [prefersReducedMotion]);

  return phase;
}

const WIDTH = 360;
const HEIGHT = 180;
const UI_BOX = { x: 24, y: 32, w: 130, h: 80 };
const AUDIO_BOX = { x: 206, y: 32, w: 130, h: 80 };
const CONNECTOR_Y = 72;

function valueLabel(value: number): string {
  return value.toFixed(2);
}

export default function StateDiagram() {
  const phase = useLoopPhase();
  const { ui, audio, syncing } = computeDesync(phase);
  const desynced = Math.abs(ui - audio) > 0.001;

  const pulseX =
    UI_BOX.x + UI_BOX.w + (AUDIO_BOX.x - (UI_BOX.x + UI_BOX.w)) * Math.min(Math.max((phase - SYNC_START) / (SYNC_END - SYNC_START), 0), 1);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Diagram showing UI Framework and Audio Engine state desynchronizing then reconciling"
      style={{ width: "100%", height: "auto", fontFamily: "monospace" }}
    >
      <line x1={UI_BOX.x + UI_BOX.w} y1={CONNECTOR_Y} x2={AUDIO_BOX.x} y2={CONNECTOR_Y} stroke="#888" strokeWidth={2} strokeDasharray="4 4" />

      {syncing && <circle cx={pulseX} cy={CONNECTOR_Y} r={5} fill="#3b82f6" />}

      <rect x={UI_BOX.x} y={UI_BOX.y} width={UI_BOX.w} height={UI_BOX.h} rx={8} fill="#eef2ff" stroke="#4338ca" strokeWidth={2} />
      <text x={UI_BOX.x + UI_BOX.w / 2} y={UI_BOX.y + 24} textAnchor="middle" fontSize={12} fill="#312e81">
        UI Framework
      </text>
      <text x={UI_BOX.x + UI_BOX.w / 2} y={UI_BOX.y + 52} textAnchor="middle" fontSize={20} fill="#312e81">
        {valueLabel(ui)}
      </text>

      <rect
        x={AUDIO_BOX.x}
        y={AUDIO_BOX.y}
        width={AUDIO_BOX.w}
        height={AUDIO_BOX.h}
        rx={8}
        fill={desynced ? "#fee2e2" : "#ecfdf5"}
        stroke={desynced ? "#b91c1c" : "#047857"}
        strokeWidth={2}
      />
      <text x={AUDIO_BOX.x + AUDIO_BOX.w / 2} y={AUDIO_BOX.y + 24} textAnchor="middle" fontSize={12} fill={desynced ? "#7f1d1d" : "#064e3b"}>
        Audio Engine
      </text>
      <text x={AUDIO_BOX.x + AUDIO_BOX.w / 2} y={AUDIO_BOX.y + 52} textAnchor="middle" fontSize={20} fill={desynced ? "#7f1d1d" : "#064e3b"}>
        {valueLabel(audio)}
      </text>

      <text x={WIDTH / 2} y={HEIGHT - 16} textAnchor="middle" fontSize={11} fill="#666">
        {desynced ? "state owned twice: values disagree" : "reconciled"}
      </text>
    </svg>
  );
}
