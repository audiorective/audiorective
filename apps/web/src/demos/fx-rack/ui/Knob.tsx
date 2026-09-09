import { useId } from "react";
import { useValue } from "@audiorective/react";
import type { Param, SchedulableParam } from "@audiorective/core";

/** A single-parameter range control. `variant` only changes the styling — a "fader" reads as a vertical strip, a "knob" as a rotary dial. */
export function Knob({
  label,
  param,
  min,
  max,
  step,
  format,
  variant = "knob",
  disabled = false,
}: {
  label: string;
  param: Param<number> | SchedulableParam;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  variant?: "knob" | "fader";
  disabled?: boolean;
}) {
  const value = useValue(param);
  const id = useId();
  return (
    <div className={`knob knob--${variant}`}>
      <label className="knob__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="knob__input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          param.value = Number(e.target.value);
        }}
      />
      <span className="knob__value">{format(value)}</span>
    </div>
  );
}
