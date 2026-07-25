import { useValue } from "@audiorective/react";
import type { DrumMachine } from "../audio/DrumMachine";

export function TransportBar({ machine }: { machine: DrumMachine }) {
  const state = useValue(machine.state);
  const bpm = useValue(machine.bpm);
  const bar = useValue(machine.currentBar);

  const playing = state === "playing";

  return (
    <div className="transport">
      <button className="transport__button transport__button--primary" onClick={() => (playing ? machine.pause() : machine.play())}>
        {playing ? "Pause" : state === "paused" ? "Resume" : "Play"}
      </button>
      <button className="transport__button" onClick={() => machine.stop()} disabled={state === "stopped"}>
        Stop
      </button>

      <span className={`transport__state transport__state--${state}`}>{state}</span>

      <label className="transport__tempo">
        <span className="transport__tempo-label">Tempo</span>
        <input
          type="range"
          min={40}
          max={220}
          step={1}
          value={Math.round(bpm)}
          aria-label="Tempo"
          onChange={(e) => {
            // A plain Param write -- the beat axis re-derives from here on,
            // mid-playback, with nothing to reschedule by hand.
            machine.bpm.value = Number(e.target.value);
          }}
        />
        <span className="transport__tempo-value">{Math.round(bpm)} BPM</span>
      </label>

      <span className="transport__position" aria-label="Position">
        {/* both readings come from one reactive ruler point */}
        {bar.bar + 1} : {Math.floor(bar.beatInBar) + 1}
      </span>
    </div>
  );
}
