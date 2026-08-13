import { useMemo } from "react";
import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";
import type { DrumTrack } from "../audio/DrumMachine";
import { stepFromPattern } from "../audio/stepFromPattern";

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
  const state = useValue(machine.state);
  const pattern = useValue(machine.currentPattern);
  const steps = useMemo(() => Array.from({ length: machine.patternLength }, (_, i) => i), [machine.patternLength]);
  // one reactive ruler reading drives every row's highlight -- `phase` is the
  // fraction through one pass, so this needs no time-signature knowledge
  const playhead = state === "playing" ? stepFromPattern(pattern, machine.patternLength) : null;

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
