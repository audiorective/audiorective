import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";

export function TransportBar() {
  const { core, machine } = useEngine();
  const state = useValue(machine.state);
  const bpm = useValue(machine.bpm);
  const bar = useValue(machine.currentBar);

  const playing = state === "playing";

  // `autoStart` would resume the context on this same click anyway, but doing it
  // here first removes the ordering question: the transport never anchors itself
  // to a suspended context's frozen `currentTime`. Both paths are idempotent.
  async function togglePlay() {
    await core.start();
    if (playing) machine.pause();
    else machine.play();
  }

  return (
    <div className="transport">
      <button className="transport__button transport__button--primary" onClick={() => void togglePlay()}>
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
