import type { CSSProperties, ReactNode } from "react";
import { getConfig } from "../config/appConfig";

const ARROWS: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Tab: "Tab", Space: "Space", Escape: "Esc" };

function codeLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return ARROWS[code] ?? code;
}

function Kbd({ children }: { children: ReactNode }) {
  return <span style={kbd}>{children}</span>;
}

/** Render the keys bound to a set of actions as <kbd> chips (deduped, in order). */
function Keys({ actions }: { actions: string[] }) {
  const km = getConfig().keybindings as Record<string, string[]>;
  const labels: string[] = [];
  for (const a of actions)
    for (const code of km[a] ?? []) {
      const l = codeLabel(code);
      if (!labels.includes(l)) labels.push(l);
    }
  return (
    <>
      {labels.map((l, i) => (
        <Kbd key={i}>{l}</Kbd>
      ))}
    </>
  );
}

export function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={backdrop} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <h2 style={title}>🎚️ You're tonight's PA tech</h2>
        <p style={sub}>Mix the band of audio drones from your iPad. Here's how it works:</p>

        <div style={row}>
          <div style={head}>Walk &amp; look</div>
          <div>
            Click the scene to enter <b>walk mode</b> — look with the mouse, move with <Keys actions={["forward", "left", "back", "right"]} />. Press{" "}
            <Kbd>Esc</Kbd> to release the cursor and use the mixer &amp; panels (<b>mix mode</b>). As you move, the spatial mix shifts.
          </div>
        </div>

        <div style={row}>
          <div style={head}>Mix</div>
          <div>
            The bottom mixer is always there — per channel: fader, meter, <Kbd>M</Kbd>ute / <Kbd>S</Kbd>olo, and <b>EQ</b>. Hit <Kbd>🎧 Phones</Kbd>{" "}
            (top-right) or <Keys actions={["toggleHeadphone"]} /> to monitor a dry headphone mix.
          </div>
        </div>

        <div style={row}>
          <div style={head}>3D pan</div>
          <div>
            Click <b>⊹ Pan</b> in the mixer to open the 3D panner. Drag a drone's <b>floor shadow</b> to move it left/right &amp; nearer/farther; drag
            its <b>floating dot</b> to change height. Panels can be dragged anywhere.
          </div>
        </div>

        <div style={row}>
          <div style={head}>FX pads</div>
          <div>
            Fire one-shots from the pads (bottom-right) or keys <Keys actions={["pad1", "pad2", "pad3", "pad4", "pad5", "pad6", "pad7", "pad8"]} />.
          </div>
        </div>

        <button style={cta} onClick={onClose}>
          Got it — let's mix
        </button>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(4,5,9,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
  pointerEvents: "auto",
  fontFamily: "system-ui, sans-serif",
};
const card: CSSProperties = {
  width: "min(92vw, 560px)",
  background: "rgba(12,14,22,0.98)",
  border: "1px solid #22d3ee55",
  borderRadius: 12,
  padding: "22px 24px",
  color: "#cde",
  boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
};
const title: CSSProperties = { margin: "0 0 4px", fontSize: 20, color: "#e6f6ff" };
const sub: CSSProperties = { margin: "0 0 16px", color: "#9ab", fontSize: 13 };
const row: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "84px 1fr",
  gap: 12,
  alignItems: "start",
  marginBottom: 12,
  fontSize: 13,
  lineHeight: 1.5,
};
const head: CSSProperties = { color: "#22d3ee", fontWeight: 600, fontSize: 12, paddingTop: 2 };
const kbd: CSSProperties = {
  display: "inline-block",
  margin: "0 2px",
  padding: "1px 6px",
  background: "#1a1d2b",
  border: "1px solid #3a3f55",
  borderBottomWidth: 2,
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "ui-monospace, monospace",
  color: "#e6f6ff",
};
const cta: CSSProperties = {
  marginTop: 8,
  width: "100%",
  padding: "9px 0",
  background: "#22d3ee22",
  border: "1px solid #22d3ee",
  color: "#9eeaff",
  borderRadius: 6,
  cursor: "pointer",
  font: "600 14px system-ui, sans-serif",
};
