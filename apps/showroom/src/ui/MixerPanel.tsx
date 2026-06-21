import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";
import { Fader } from "./Fader";
import { Meter } from "./Meter";

function MiniStrip({ channel }: { channel: Channel }) {
  const muted = useValue(channel.params.muted);
  const soloed = useValue(channel.params.soloed);
  return (
    <div style={col}>
      <div style={{ display: "flex", gap: 4, height: 80 }}>
        <Fader param={channel.params.volume} height={80} />
        <Meter level={channel.cells.level} height={80} />
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
        <button style={{ ...mini, ...(muted ? { background: "#dc2626", color: "#fff" } : {}) }} onClick={() => (channel.params.muted.value = !muted)}>
          M
        </button>
        <button
          style={{ ...mini, ...(soloed ? { background: "#eab308", color: "#180c02" } : {}) }}
          onClick={() => (channel.params.soloed.value = !soloed)}
        >
          S
        </button>
      </div>
      <div style={{ ...tag, background: channel.color }}>{channel.label.slice(0, 4)}</div>
    </div>
  );
}

export function MixerPanel() {
  const masterVol = useValue(engine.mixer.params.masterVolume);
  return (
    <div style={panel}>
      {engine.channels.map((c) => (
        <MiniStrip key={c.id} channel={c} />
      ))}
      <div style={{ ...col, borderLeft: "1px solid #ffffff22", paddingLeft: 6 }}>
        <div style={{ display: "flex", gap: 4, height: 80 }}>
          <Fader param={engine.mixer.params.masterVolume} height={80} />
          <Meter level={engine.mixer.cells.masterLevel} height={80} />
        </div>
        <div style={{ ...tag, border: "1px solid #eab30855", color: "#eab308", marginTop: 18 }}>MST {Math.round(masterVol * 100)}</div>
      </div>
    </div>
  );
}

const panel: CSSProperties = {
  display: "inline-flex",
  gap: 6,
  padding: 8,
  background: "rgba(8,10,18,0.92)",
  border: "1px solid #22d3ee55",
  borderRadius: 6,
  pointerEvents: "auto",
  fontFamily: "system-ui, sans-serif",
};
const col: CSSProperties = { width: 34, display: "flex", flexDirection: "column", alignItems: "center", fontSize: 9, color: "#9be" };
const mini: CSSProperties = {
  flex: 1,
  fontSize: 9,
  background: "#1a1a2e",
  border: "1px solid #ffffff22",
  color: "#9be",
  borderRadius: 2,
  cursor: "pointer",
};
const tag: CSSProperties = { marginTop: 3, width: "100%", textAlign: "center", borderRadius: 2, color: "#06140a", fontSize: 9 };
