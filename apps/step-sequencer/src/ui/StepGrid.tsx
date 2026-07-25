import { useValue } from "@audiorective/react";
import type { DrumMachine, DrumTrack } from "../audio/DrumMachine";
import { STEPS_PER_BAR, stepFromBar } from "../audio/stepFromBar";

const STEPS = Array.from({ length: STEPS_PER_BAR }, (_, i) => i);

function TrackRow({ machine, track, playhead }: { machine: DrumMachine; track: DrumTrack; playhead: number | null }) {
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
        {STEPS.map((step) => (
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

export function StepGrid({ machine }: { machine: DrumMachine }) {
  const state = useValue(machine.state);
  const bar = useValue(machine.currentBar);
  // one reactive ruler reading drives every row's highlight
  const playhead = state === "playing" ? stepFromBar(bar) : null;

  return (
    <div className="grid">
      <div className="grid__ruler">
        <div className="row__head" />
        <div className="row__steps">
          {STEPS.map((step) => (
            <span key={step} className={`tick${step % 4 === 0 ? " tick--downbeat" : ""}`}>
              {step % 4 === 0 ? step / 4 + 1 : ""}
            </span>
          ))}
        </div>
      </div>
      {machine.tracks.map((track) => (
        <TrackRow key={track.id} machine={machine} track={track} playhead={playhead} />
      ))}
    </div>
  );
}
