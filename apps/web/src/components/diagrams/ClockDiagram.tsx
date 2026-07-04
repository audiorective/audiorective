import { useEffect, useRef, useState } from "react";
import { simulateBeats, type Beat } from "./lookaheadModel";

const BEAT_COUNT = 8;
const JITTER = 0.02;
const GC_AT = 3;
const LOOP_MS = 4000;

// Single source for the audio row's beats. Phase 4.6 swaps this for a live
// transport read; everything downstream just consumes a Beat[].
function getAudioTimelineBeats(): Beat[] {
  return simulateBeats({ count: BEAT_COUNT, jitter: JITTER, gcAt: GC_AT });
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
  // Hold on a frame that shows the GC stall (just past the late beat) when
  // motion is reduced, rather than animating.
  const [phase, setPhase] = useState((GC_AT + 0.5) / BEAT_COUNT);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setPhase((GC_AT + 0.5) / BEAT_COUNT);
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

const WIDTH = 420;
const HEIGHT = 220;
const MARGIN_X = 24;
const TRACK_WIDTH = WIDTH - MARGIN_X * 2;
const AUDIO_Y = 56;
const JS_Y = 140;
const BEAT_RADIUS = 6;
const GC_BLOCK_WIDTH = 26;

function beatX(grid: number, lastGrid: number): number {
  return MARGIN_X + (grid / lastGrid) * TRACK_WIDTH;
}

export default function ClockDiagram() {
  const phase = useLoopPhase();
  const beats = getAudioTimelineBeats();
  const lastGrid = beats[beats.length - 1].grid;
  const playheadX = MARGIN_X + phase * TRACK_WIDTH;
  const lateBeat = beats.find((b) => b.late);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Diagram comparing the sample-accurate audio clock, which lands every beat on the grid, against the jittery JavaScript setTimeout clock, which slips late during a garbage collection pause"
      style={{ width: "100%", height: "auto", fontFamily: "monospace" }}
    >
      <text x={MARGIN_X} y={24} fontSize={12} fill="#312e81">
        Audio clock
      </text>
      <line x1={MARGIN_X} y1={AUDIO_Y} x2={WIDTH - MARGIN_X} y2={AUDIO_Y} stroke="#c7d2fe" strokeWidth={2} />
      {beats.map((beat) => (
        <circle key={`audio-${beat.grid}`} cx={beatX(beat.grid, lastGrid)} cy={AUDIO_Y} r={BEAT_RADIUS} fill="#4338ca" />
      ))}

      <text x={MARGIN_X} y={JS_Y - 32} fontSize={12} fill="#7f1d1d">
        JS clock (setTimeout)
      </text>
      <line x1={MARGIN_X} y1={JS_Y} x2={WIDTH - MARGIN_X} y2={JS_Y} stroke="#fecaca" strokeWidth={2} />
      {lateBeat && (
        <rect
          x={beatX(lateBeat.grid, lastGrid) - GC_BLOCK_WIDTH / 2}
          y={JS_Y - 16}
          width={GC_BLOCK_WIDTH}
          height={32}
          fill="#ef4444"
          opacity={0.25}
        />
      )}
      {beats.map((beat) => (
        <circle key={`js-${beat.grid}`} cx={beatX(beat.jsActual, lastGrid)} cy={JS_Y} r={BEAT_RADIUS} fill={beat.late ? "#dc2626" : "#b91c1c"} />
      ))}

      <line x1={playheadX} y1={16} x2={playheadX} y2={JS_Y + 20} stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" />

      <text x={WIDTH / 2} y={HEIGHT - 16} textAnchor="middle" fontSize={11} fill="#666">
        the lookahead schedules JS beats ahead of time, so they still land on the audio grid
      </text>
    </svg>
  );
}
