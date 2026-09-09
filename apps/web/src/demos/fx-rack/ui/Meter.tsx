import { useValue } from "@audiorective/react";
import type { Cell, Param, SchedulableParam } from "@audiorective/core";
import type { FxRack } from "../audio/FxRack";
import { useEngine } from "../audio/engine";
import { Knob } from "./Knob";

export interface MeterSpec {
  reduction: Cell<number>;
  threshold: { param: Param<number> | SchedulableParam; min: number; max: number };
}

/** Gain-reduction strip: a vertical bar reading `reduction` (0 dB at top down to `min` dB) plus the threshold knob. */
export function Meter({ title, pick, min = -30 }: { title: string; pick: (rack: FxRack) => MeterSpec; min?: number }) {
  const { rack: rackCell } = useEngine();
  const rack = useValue(rackCell);
  const spec = pick(rack);
  const db = useValue(spec.reduction);
  const pct = Math.min(100, Math.max(0, (db / min) * 100));

  return (
    <section className="module module--meter">
      <header className="module__head">
        <span className="module__title">{title}</span>
      </header>
      <div className="meter">
        <div className="meter__track" role="meter" aria-label={`${title} gain reduction`} aria-valuemin={min} aria-valuemax={0} aria-valuenow={db}>
          <div className="meter__fill" style={{ height: `${pct}%` }} />
        </div>
        <span className="meter__value">{db.toFixed(1)} dB</span>
      </div>
      <Knob
        variant="knob"
        label="Threshold"
        param={spec.threshold.param}
        min={spec.threshold.min}
        max={spec.threshold.max}
        step={0.5}
        format={(v) => `${v.toFixed(1)} dB`}
      />
    </section>
  );
}
