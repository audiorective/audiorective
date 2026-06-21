import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { Readable } from "@audiorective/core";

/** Segmented level meter. `level` is a 0..~1 RMS cell updated by the Mixer metering loop. */
export function Meter({ level, height = 80 }: { level: Readable<number>; height?: number }) {
  const v = useValue(level);
  const segs = 10;
  const lit = Math.round(Math.min(1, v * 1.4) * segs);
  return (
    <div style={{ ...meterStyle, height }}>
      {Array.from({ length: segs }, (_, i) => {
        const idx = segs - 1 - i; // top-down
        const on = idx < lit;
        const color = idx >= segs - 2 ? "#dc2626" : idx >= segs - 4 ? "#eab308" : "#16a34a";
        return <div key={i} style={{ flex: 1, background: on ? color : "#16181f", borderRadius: 1 }} />;
      })}
    </div>
  );
}

const meterStyle: CSSProperties = {
  width: 8,
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: 1,
  background: "#0c0d12",
  borderRadius: 2,
};
