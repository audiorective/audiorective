import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";

interface Props {
  onSelectChannel: (id: string) => void;
  onOpenMixer: () => void;
  activeView: { kind: "channel"; id: string } | { kind: "mixer" } | { kind: "none" };
}

export function ChannelMenu({ onSelectChannel, onOpenMixer, activeView }: Props) {
  const selected = useValue(engine.selectedChannelId);
  return (
    <div style={menu}>
      <div style={heading}>DRONES</div>
      <div style={rule} />
      {engine.channels.map((c) => {
        const active = activeView.kind === "channel" && activeView.id === c.id;
        return (
          <button
            key={c.id}
            style={{ ...row, ...(active || selected === c.id ? { background: `${c.color}33`, borderLeft: `2px solid ${c.color}` } : {}) }}
            onClick={() => onSelectChannel(c.id)}
          >
            {c.label}
          </button>
        );
      })}
      <div style={rule} />
      <button style={{ ...row, color: "#eab308", ...(activeView.kind === "mixer" ? { background: "#eab30822" } : {}) }} onClick={onOpenMixer}>
        Mixer
      </button>
    </div>
  );
}

const menu: CSSProperties = {
  width: 110,
  background: "rgba(8,10,18,0.82)",
  border: "1px solid #22d3ee44",
  borderRadius: 6,
  padding: 7,
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  color: "#9be",
  pointerEvents: "auto",
};
const heading: CSSProperties = { color: "#22d3ee", letterSpacing: 1, fontSize: 10 };
const rule: CSSProperties = { borderBottom: "1px solid #22d3ee33", margin: "4px 0" };
const row: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderLeft: "2px solid transparent",
  color: "inherit",
  padding: "3px 4px",
  cursor: "pointer",
  font: "inherit",
};
