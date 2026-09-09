import { useState } from "react";
import { useValue } from "@audiorective/react";
import type { Param, SchedulableParam } from "@audiorective/core";
import type { PitchShiftEngine } from "@audiorective/effects";
import type { FxRack } from "../audio/FxRack";
import { useEngine } from "../audio/engine";
import { Knob } from "./Knob";

type NumParam = Param<number> | SchedulableParam;

export interface ModuleSpec {
  fader: { label: string; param: NumParam; min: number; max: number; step: number };
  knob?: { label: string; param: NumParam; min: number; max: number; step: number; format: (v: number) => string };
  /** Samples-to-milliseconds readout; omit for a strip with no meaningful path latency of its own. */
  latency?: Param<number>;
  /** Present only on the pitch-shift strip: the engine currently in use, which turns on the swap toggle. */
  engine?: PitchShiftEngine;
}

function EngineToggle({ engine }: { engine: PitchShiftEngine }) {
  const { setEngine } = useEngine();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function swap(next: PitchShiftEngine) {
    if (next === engine || pending) return;
    setPending(true);
    setError(null);
    try {
      await setEngine(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Engine swap failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="module__engine">
      {(["granular", "stretch"] as const).map((id) => (
        <button
          key={id}
          type="button"
          className={`module__engine-button${engine === id ? " module__engine-button--active" : ""}`}
          onClick={() => void swap(id)}
          disabled={pending}
          aria-pressed={engine === id}
        >
          {id}
        </button>
      ))}
      {error && <span className="module__engine-error">{error}</span>}
    </div>
  );
}

function LatencyReadout({ latency }: { latency: Param<number> }) {
  const samples = useValue(latency);
  const { rack: rackCell } = useEngine();
  const rack = useValue(rackCell);
  const ms = (samples / rack.context.sampleRate) * 1000;
  return (
    <div className="module__latency">
      <span className="module__latency-value">{samples}</span> smp / <span className="module__latency-value">{ms.toFixed(1)}</span> ms
    </div>
  );
}

/** One rack strip: title, wet/send fader, an optional main control knob, and a latency readout. */
export function Module({ title, pick }: { title: string; pick: (rack: FxRack) => ModuleSpec }) {
  const { rack: rackCell } = useEngine();
  const rack = useValue(rackCell);
  const spec = pick(rack);

  return (
    <section className="module">
      <header className="module__head">
        <span className="module__title">{title}</span>
      </header>

      <Knob
        variant="fader"
        label={spec.fader.label}
        param={spec.fader.param}
        min={spec.fader.min}
        max={spec.fader.max}
        step={spec.fader.step}
        format={(v) => v.toFixed(2)}
      />

      {spec.knob && (
        <Knob
          variant="knob"
          label={spec.knob.label}
          param={spec.knob.param}
          min={spec.knob.min}
          max={spec.knob.max}
          step={spec.knob.step}
          format={spec.knob.format}
        />
      )}

      {spec.engine && <EngineToggle engine={spec.engine} />}

      {spec.latency && <LatencyReadout latency={spec.latency} />}
    </section>
  );
}
