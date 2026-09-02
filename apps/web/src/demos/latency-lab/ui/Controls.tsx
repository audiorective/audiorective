import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";

const LOOKAHEAD_MIN_MS = 5;
const LOOKAHEAD_MAX_MS = 100;

export function Controls() {
  const { core, clock, lab, click, master } = useEngine();
  const state = useValue(clock.state);
  const pdcEnabled = useValue(lab.pdcEnabled);
  const bypassed = useValue(lab.limiterBypassed);
  const clickEnabled = useValue(click.enabled);
  const limiter = lab.limiter;
  if (!limiter) throw new Error("Controls mounted before the limiter was attached — it should only render once `engine.ready` resolves.");
  const latencySamples = useValue(limiter.latency);
  const lookaheadMs = (latencySamples / core.context.sampleRate) * 1000;

  const playing = state === "playing";

  async function togglePlay() {
    await core.start();
    if (playing) clock.stop();
    else clock.start();
  }

  return (
    <div className="controls">
      <button className="controls__button controls__button--primary" onClick={() => void togglePlay()}>
        {playing ? "Stop" : "Play"}
      </button>

      <label className="controls__toggle">
        <input type="checkbox" checked={pdcEnabled} onChange={(e) => lab.setPdc(e.target.checked)} />
        PDC
      </label>
      <p className="controls__note">Re-wires audibly when toggled while playing.</p>

      <label className="controls__toggle">
        <input type="checkbox" checked={bypassed} onChange={(e) => (lab.limiterBypassed.value = e.target.checked)} />
        Bypass limiter
      </label>

      <label className="controls__slider">
        <span>Lookahead</span>
        <input
          type="range"
          min={LOOKAHEAD_MIN_MS}
          max={LOOKAHEAD_MAX_MS}
          step={1}
          defaultValue={lookaheadMs}
          aria-label="Lookahead"
          onChange={(e) => {
            const ms = Number(e.target.value);
            const samples = Math.round((ms / 1000) * core.context.sampleRate);
            const min = limiter.latency.min ?? 1;
            const max = limiter.latency.max ?? core.context.sampleRate;
            limiter.latency.value = Math.min(Math.max(samples, min), max);
          }}
        />
        <span className="controls__slider-value">{Math.round(lookaheadMs)} ms</span>
      </label>

      <label className="controls__toggle">
        <input type="checkbox" checked={clickEnabled} onChange={(e) => (click.enabled.value = e.target.checked)} />
        Click
      </label>

      <label className="controls__slider">
        <span>Master</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={master.gain.value}
          aria-label="Master volume"
          onChange={(e) => (master.gain.value = Number(e.target.value))}
        />
      </label>
    </div>
  );
}
