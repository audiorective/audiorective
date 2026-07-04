import type { Readable } from "@audiorective/core";
import { useValue } from "@audiorective/react";

interface FaderProps {
  /** A volume Param (0..1). */
  param: Readable<number> & { value: number };
  height?: number;
}

/** Vertical volume fader. Writes the Param directly on input. */
export function Fader({ param, height = 80 }: FaderProps) {
  const v = useValue(param);
  return (
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={v}
      onChange={(e) => {
        param.value = Number(e.target.value);
      }}
      style={{
        writingMode: "vertical-lr",
        direction: "rtl",
        width: 18,
        height,
        accentColor: "#22d3ee",
      }}
    />
  );
}
