import { useEffect, type CSSProperties } from "react";
import { engine } from "../audio/engine";
import { getConfig, matchAction, type Action } from "../config/appConfig";

const PAD_ACTIONS: Action[] = ["pad1", "pad2", "pad3", "pad4", "pad5", "pad6", "pad7", "pad8"];

export function PadPanel() {
  const fx = getConfig().audio.fx;

  // Keyboard: padN action → the Nth configured FX pad.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAction(e);
      if (!action) return;
      const idx = PAD_ACTIONS.indexOf(action);
      if (idx >= 0 && idx < fx.length) {
        e.preventDefault();
        engine.sampler?.trigger(fx[idx].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fx]);

  return (
    <div style={grid}>
      {fx.map((pad) => (
        <button key={pad.id} style={padStyle} onClick={() => engine.sampler?.trigger(pad.id)}>
          {pad.label}
        </button>
      ))}
    </div>
  );
}

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 6,
  padding: 8,
  background: "rgba(8,10,18,0.9)",
  border: "1px solid #a855f755",
  borderRadius: 6,
  pointerEvents: "auto",
};
const padStyle: CSSProperties = {
  aspectRatio: "1.5",
  minWidth: 64,
  background: "#a855f733",
  border: "1px solid #a855f7",
  color: "#e9d5ff",
  borderRadius: 4,
  cursor: "pointer",
  font: "600 11px system-ui, sans-serif",
};
