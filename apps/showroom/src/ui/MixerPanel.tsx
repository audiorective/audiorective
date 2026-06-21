import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import type { Channel } from "../audio/Channel";
import { Fader } from "./Fader";
import { Meter } from "./Meter";

interface Props {
  onOpenEq: (channelId: string) => void;
  onOpenPan: () => void;
}

function ChannelColumn({ channel, selected, onOpenEq }: { channel: Channel; selected: boolean; onOpenEq: (id: string) => void }) {
  const muted = useValue(channel.params.muted);
  const soloed = useValue(channel.params.soloed);
  return (
    <div style={{ ...col, ...(selected ? { background: "#ffffff10", borderColor: channel.color } : {}) }}>
      <button style={{ ...nameTag, background: channel.color }} onClick={() => (engine.selectedChannelId.value = channel.id)}>
        {channel.label}
      </button>
      <button
        style={eqBtn}
        onClick={() => {
          engine.selectedChannelId.value = channel.id;
          onOpenEq(channel.id);
        }}
      >
        EQ
      </button>
      <div style={{ display: "flex", gap: 4, height: 78 }}>
        <Fader param={channel.params.volume} height={78} />
        <Meter level={channel.cells.level} height={78} />
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: 3, width: "100%" }}>
        <button style={{ ...ms, ...(muted ? { background: "#dc2626", color: "#fff" } : {}) }} onClick={() => (channel.params.muted.value = !muted)}>
          M
        </button>
        <button
          style={{ ...ms, ...(soloed ? { background: "#eab308", color: "#180c02" } : {}) }}
          onClick={() => (channel.params.soloed.value = !soloed)}
        >
          S
        </button>
      </div>
    </div>
  );
}

export function MixerPanel({ onOpenEq, onOpenPan }: Props) {
  const selectedId = useValue(engine.selectedChannelId);
  const masterVol = useValue(engine.mixer.params.masterVolume);
  return (
    <div style={bar}>
      {engine.channels.map((c) => (
        <ChannelColumn key={c.id} channel={c} selected={c.id === selectedId} onOpenEq={onOpenEq} />
      ))}

      {/* Common section: one Pan button (opens the panning panel for the selected drone) + master. */}
      <div style={{ ...col, borderLeft: "1px solid #ffffff22", paddingLeft: 8, width: 56 }}>
        <button style={panBtn} onClick={onOpenPan}>
          ⊹ Pan
        </button>
        <div style={{ display: "flex", gap: 4, height: 78, marginTop: 2 }}>
          <Fader param={engine.mixer.params.masterVolume} height={78} />
          <Meter level={engine.mixer.cells.masterLevel} height={78} />
        </div>
        <div style={{ ...nameTag, border: "1px solid #eab30855", color: "#eab308", background: "transparent", marginTop: 3 }}>
          MST {Math.round(masterVol * 100)}
        </div>
      </div>
    </div>
  );
}

const bar: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 12,
  transform: "translateX(-50%)",
  display: "inline-flex",
  gap: 6,
  padding: 8,
  background: "rgba(8,10,18,0.92)",
  border: "1px solid #22d3ee55",
  borderRadius: 8,
  pointerEvents: "auto",
  fontFamily: "system-ui, sans-serif",
};
const col: CSSProperties = {
  width: 48,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 3,
  fontSize: 9,
  color: "#9be",
  border: "1px solid transparent",
  borderRadius: 4,
  padding: "3px 2px",
};
const nameTag: CSSProperties = {
  width: "100%",
  textAlign: "center",
  borderRadius: 2,
  color: "#06140a",
  fontSize: 9,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  padding: "2px 0",
};
const eqBtn: CSSProperties = {
  width: "100%",
  background: "#0c0c16",
  border: "1px solid #22d3ee55",
  color: "#22d3ee",
  borderRadius: 2,
  fontSize: 9,
  cursor: "pointer",
  padding: "2px 0",
};
const panBtn: CSSProperties = {
  width: "100%",
  background: "#1a1230",
  border: "1px solid #a855f7",
  color: "#c084fc",
  borderRadius: 3,
  fontSize: 10,
  cursor: "pointer",
  padding: "4px 0",
};
const ms: CSSProperties = {
  flex: 1,
  fontSize: 9,
  background: "#1a1a2e",
  border: "1px solid #ffffff22",
  color: "#9be",
  borderRadius: 2,
  cursor: "pointer",
};
