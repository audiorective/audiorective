import { useEffect, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { PAD_IDS, type PadId } from "../audio/sources/SamplerSource";
import { matchAction } from "../config/appConfig";

const PAD_BY_ACTION: Record<string, PadId> = { pad1: "boom", pad2: "riser", pad3: "airhorn", pad4: "applause" };

export function PadPanel() {
  // Keyboard triggers (pad1..pad4) — active whenever the pad panel is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAction(e);
      if (action && action in PAD_BY_ACTION) {
        e.preventDefault();
        engine.sampler?.trigger(PAD_BY_ACTION[action]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={grid}>
      {PAD_IDS.map((id) => (
        <button key={id} style={pad} onClick={() => engine.sampler?.trigger(id)}>
          {id.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
  padding: 8,
  background: "rgba(8,10,18,0.9)",
  border: "1px solid #a855f755",
  borderRadius: 6,
  pointerEvents: "auto",
};
const pad: CSSProperties = {
  aspectRatio: "1.6",
  minWidth: 70,
  background: "#a855f733",
  border: "1px solid #a855f7",
  color: "#e9d5ff",
  borderRadius: 4,
  cursor: "pointer",
  font: "600 12px system-ui, sans-serif",
};
