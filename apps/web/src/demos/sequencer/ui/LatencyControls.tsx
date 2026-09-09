import { useValue } from "@audiorective/react";
import { useEngine } from "../audio/engine";

const LOOKAHEAD_MIN_MS = 5;
const LOOKAHEAD_MAX_MS = 100;

export function LatencyControls() {
  const { core, lab } = useEngine();
  const pdcEnabled = useValue(lab.pdcEnabled);
  const bypassed = useValue(lab.limiterBypassed);
  const limiter = lab.limiter;
  if (!limiter) throw new Error("LatencyControls mounted before the limiter was attached — it should only render once `engine.ready` resolves.");
  const latencySamples = useValue(limiter.latency);
  const lookaheadMs = (latencySamples / core.context.sampleRate) * 1000;

  return (
    <div className="controls">
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
            // A Param write: the graph re-solves, the dry branch's compensation
            // delay follows, and the playhead's heard-time offset grows with it.
            const ms = Number(e.target.value);
            const samples = Math.round((ms / 1000) * core.context.sampleRate);
            const min = limiter.latency.min ?? 1;
            const max = limiter.latency.max ?? core.context.sampleRate;
            limiter.latency.value = Math.min(Math.max(samples, min), max);
          }}
        />
        <span className="controls__slider-value">{Math.round(lookaheadMs)} ms</span>
      </label>
    </div>
  );
}
