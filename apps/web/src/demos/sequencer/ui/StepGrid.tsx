import { useMemo } from "react";
import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";
import type { DrumTrack } from "../audio/DrumMachine";
import { heardTime } from "../audio/heardTime";
import { stepFromPattern } from "../audio/stepFromPattern";

/**
 * The step the listener is hearing right now, or `null` when nothing is.
 *
 * `currentPattern` is the clock's reactive reading at the render clock,
 * refreshed every tick — subscribing to it is what re-runs this on every
 * tick. The reading itself is taken at `heardTime`: the same ruler, at the
 * render clock minus the graph's compensated latency and the output latency.
 * With the limiter's lookahead at 100 ms that gap is most of a sixteenth, so
 * reading at the render clock would light each step before it sounds.
 */
function useHeardStep(): number | null {
  const { core, machine } = useEngine();
  const state = useValue(machine.state);
  useValue(machine.currentPattern);
  const latency = useValue(core.latency);
  if (state !== "playing") return null;
  const ctx = core.context;
  const point = machine.patternAt(heardTime(ctx.currentTime, latency, ctx.sampleRate, ctx.outputLatency ?? 0));
  return point && stepFromPattern(point, machine.patternLength);
}

function TrackRow({ track, steps, playhead }: { track: DrumTrack; steps: number[]; playhead: number | null }) {
  const { machine } = useEngine();
  const pattern = useValue(track.pattern);
  const muted = useValue(track.mute);

  return (
    <div className={`row${muted ? " row--muted" : ""}`}>
      <div className="row__head">
        <span className="row__label">{track.label}</span>
        <button
          className={`row__mute${muted ? " row__mute--on" : ""}`}
          onClick={() => (track.mute.value = !muted)}
          aria-label={`${muted ? "Unmute" : "Mute"} ${track.label}`}
          aria-pressed={muted}
        >
          M
        </button>
      </div>
      <div className="row__steps">
        {steps.map((step) => (
          <button
            key={step}
            className={["step", pattern[step] ? "step--on" : "", step === playhead ? "step--playhead" : "", step % 4 === 0 ? "step--downbeat" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => machine.toggleStep(track.id, step)}
            aria-label={`${track.label} step ${step + 1}`}
            aria-pressed={pattern[step]}
          />
        ))}
      </div>
    </div>
  );
}

export function StepGrid() {
  const { machine } = useEngine();
  const steps = useMemo(() => Array.from({ length: machine.patternLength }, (_, i) => i), [machine.patternLength]);
  // one reading drives every row's highlight -- `phase` is the fraction
  // through one pass, so this needs no time-signature knowledge
  const playhead = useHeardStep();

  return (
    <div className="grid">
      <div className="grid__ruler">
        <div className="row__head" />
        <div className="row__steps">
          {steps.map((step) => (
            <span key={step} className={`tick${step % 4 === 0 ? " tick--downbeat" : ""}`}>
              {step % 4 === 0 ? step / 4 + 1 : ""}
            </span>
          ))}
        </div>
      </div>
      {machine.tracks.map((track) => (
        <TrackRow key={track.id} track={track} steps={steps} playhead={playhead} />
      ))}
    </div>
  );
}
