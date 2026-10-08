import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useValue } from "@audiorective/react";
import type { Param, SchedulableParam } from "@audiorective/core";
import { engine, EngineProvider, useEngine } from "./audio/engine";
import { MIN_CUTOFF, MAX_CUTOFF, MAX_WET } from "./audio/padCoordinates";
import type { DrumTrack } from "../../demos/sequencer/audio/DrumMachine";
import { stepFromPattern } from "../../demos/sequencer/audio/stepFromPattern";

function Slider({
  label,
  param,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string;
  param: Param<number> | SchedulableParam;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const value = useValue(param);
  return (
    <label className="console-slider">
      <span>
        {label}
        <output>
          {value.toFixed(step < 1 ? 2 : 0)}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          param.value = Number(event.target.value);
        }}
      />
    </label>
  );
}

function Transport({ compact = false }: { compact?: boolean }) {
  const e = useEngine();
  const state = useValue(e.machine.state);
  const muted = useValue(e.master.params.mute);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const handlePlay = async () => {
    setPending(true);
    setError("");
    try {
      if (state === "playing") await e.pause();
      else await e.play();
    } catch {
      setError("Audio could not start. Please try Play again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={compact ? "transport transport--compact" : "transport"}>
      <button className="console-button console-button--primary" disabled={pending} onClick={handlePlay}>
        {pending ? "Starting…" : state === "playing" ? "Pause" : "Play beat"}
        <span aria-hidden="true">{state === "playing" ? "Ⅱ" : "▶"}</span>
      </button>
      <button
        className="console-button"
        aria-pressed={muted}
        onClick={() => {
          e.master.params.mute.value = !muted;
        }}
      >
        {muted ? "Unmute" : "Mute"}
      </button>
      {!compact && <Slider label="Tempo" param={e.machine.bpm} min={70} max={160} unit=" BPM" />}
      <Slider label="Output" param={e.master.params.gain} min={0} max={0.7} step={0.01} />
      {error && (
        <p className="demo-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Track({ track, full, heardStep }: { track: DrumTrack; full: boolean; heardStep: number | null }) {
  const pattern = useValue(track.pattern);
  const muted = useValue(track.mute);
  const { machine } = useEngine();
  return (
    <div className={`beat-track${muted ? " beat-track--muted" : ""}`}>
      <button
        className="track-label"
        aria-label={`${muted ? "Unmute" : "Mute"} ${track.label}`}
        aria-pressed={muted}
        onClick={() => {
          track.mute.value = !muted;
        }}
      >
        {track.label}
        <span>{muted ? "OFF" : "ON"}</span>
      </button>
      <div className={full ? "beat-steps" : "beat-summary"}>
        {pattern.map((on, index) =>
          full ? (
            <button
              key={index}
              className={`beat-step${heardStep === index ? " beat-step--current" : ""}`}
              aria-label={`${track.label} step ${index + 1}`}
              aria-pressed={on}
              onClick={() => machine.toggleStep(track.id, index)}
            >
              <span>{index + 1}</span>
            </button>
          ) : (
            <span key={index} className={`${on ? "is-on" : ""} ${heardStep === index ? "is-current" : ""}`} />
          ),
        )}
      </div>
    </div>
  );
}

function Pattern({ full = false }: { full?: boolean }) {
  const { machine, core } = useEngine();
  const state = useValue(machine.state);
  useValue(machine.currentPattern);
  const point = state === "playing" ? machine.patternAt(core.perceivedTime) : null;
  const heardStep = point ? stepFromPattern(point, machine.patternLength) : null;
  return (
    <div className="console-pattern">
      <div className="console-panel-header">
        <span>{full ? "Pattern editor" : "Session 01 / four voices"}</span>
        <span className="tool-label">React</span>
      </div>
      {machine.tracks.map((track) => (
        <Track key={track.id} track={track} full={full} heardStep={heardStep} />
      ))}
      <div className="console-readout">
        <span>{state === "playing" ? "PLAYING" : state === "paused" ? "PAUSED" : "READY"}</span>
        <span>4/4 · 16 STEPS</span>
      </div>
    </div>
  );
}

function Pad() {
  const host = useRef<HTMLDivElement>(null);
  const e = useEngine();
  const [status, setStatus] = useState("Loading interactive canvas…");
  useEffect(() => {
    const target = host.current!;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        void import("./audio/pixiPad")
          .then(({ mountPad }) => {
            if (cancelled) return;
            return mountPad(target, e);
          })
          .then((cleanup) => {
            if (cancelled) cleanup?.();
            else {
              dispose = cleanup;
              setStatus("");
            }
          })
          .catch(() => {
            if (!cancelled) setStatus("Canvas unavailable. The sliders control the same sound.");
          });
      },
      { rootMargin: "200px" },
    );
    observer.observe(target);
    return () => {
      cancelled = true;
      observer.disconnect();
      dispose?.();
    };
  }, [e]);
  return (
    <div className="pad-panel">
      <div className="console-panel-header">
        <span>Sound field</span>
        <span className="tool-label">PixiJS</span>
      </div>
      <div className="xy-pad" role="group" aria-label="Filter and echo XY pad. Use the adjacent sliders for keyboard control.">
        <div className="pad-canvas" ref={host} />
        {status && <p className="pad-status">{status}</p>}
      </div>
      <div className="console-readout">
        <span>← FILTER →</span>
        <span>↑ ECHO</span>
      </div>
    </div>
  );
}

function SoundControls() {
  const { filter, delay } = useEngine();
  return (
    <div className="sound-controls">
      <div className="console-panel-header">
        <span>Same parameters</span>
        <span className="tool-label">React</span>
      </div>
      <Slider label="Filter" param={filter.params.frequency} min={MIN_CUTOFF} max={MAX_CUTOFF} unit=" Hz" />
      <Slider label="Echo" param={delay.params.wet} min={0} max={MAX_WET} step={0.01} />
      <p className="console-note">
        Drag the point or move a slider.
        <br />
        Both views follow the same values.
      </p>
    </div>
  );
}

function Effects() {
  const { filter, delay } = useEngine();
  const wet = useValue(filter.params.wet);
  return (
    <div className="effects-console">
      <div className="signal-path" aria-label="Audio path">
        <span>Sampler × 4</span>
        <b>→</b>
        <span className={wet ? "path-active" : ""}>{wet ? "Filter" : "Dry"}</span>
        <b>→</b>
        <span>Delay</span>
        <b>→</b>
        <span>Output</span>
      </div>
      <div className="effect-controls">
        <button
          className="console-button"
          aria-pressed={!wet}
          onClick={() => {
            filter.params.wet.value = wet ? 0 : 1;
          }}
        >
          {wet ? "Bypass filter" : "Enable filter"}
        </button>
        <Slider label="Delay time" param={delay.params.delayTime} min={0.08} max={0.6} step={0.01} unit=" s" />
        <Slider label="Feedback" param={delay.params.feedback} min={0} max={0.65} step={0.01} />
      </div>
      <p className="console-note">Filter and echo settings carry over from the sound field above.</p>
    </div>
  );
}

function Panels() {
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const [showTransport, setShowTransport] = useState(false);
  const state = useValue(engine.machine.state);
  useEffect(() => {
    const ids = ["hero-console", "shared-console", "pattern-console", "effects-console"];
    setHosts(ids.map((id) => document.getElementById(id)!));
    const observer = new IntersectionObserver(([entry]) => setShowTransport(!entry.isIntersecting));
    observer.observe(document.getElementById("hero-console")!);
    const pause = () => {
      void engine.pause().catch(() => {});
    };
    window.addEventListener("pagehide", pause);
    return () => {
      observer.disconnect();
      window.removeEventListener("pagehide", pause);
      void engine.stop().catch(() => {});
    };
  }, []);
  if (!hosts.length) return null;
  return (
    <>
      {createPortal(
        <>
          <Pattern />
          <Transport />
          <p className="console-note">Sound starts with Play. Tap a voice to mute it.</p>
        </>,
        hosts[0],
      )}
      {createPortal(
        <div className="shared-controls">
          <Pad />
          <SoundControls />
        </div>,
        hosts[1],
      )}
      {createPortal(
        <>
          <Pattern full />
          <Transport />
        </>,
        hosts[2],
      )}
      {createPortal(<Effects />, hosts[3])}
      {showTransport && state !== "stopped" && (
        <aside className="floating-transport" aria-label="Demo playback">
          <span className="tool-label">YOUR SESSION</span>
          <Transport compact />
        </aside>
      )}
    </>
  );
}

export default function LandingDemo() {
  return (
    <EngineProvider autoStart={false}>
      <Panels />
    </EngineProvider>
  );
}
