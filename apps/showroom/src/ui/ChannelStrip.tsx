import type { CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import type { Channel } from "../audio/Channel";
import { Fader } from "./Fader";
import { Meter } from "./Meter";

interface Props {
  channel: Channel;
  onOpenEq: () => void;
  onOpenPanning: () => void;
}

export function ChannelStrip({ channel, onOpenEq, onOpenPanning }: Props) {
  const muted = useValue(channel.params.muted);
  const soloed = useValue(channel.params.soloed);

  return (
    <div style={{ ...strip, borderColor: channel.color }}>
      <div style={{ ...name, background: channel.color }}>{channel.label}</div>

      <button style={headerBtn} onClick={onOpenPanning}>
        PAN ▸ 3D
      </button>
      <button style={headerBtn} onClick={onOpenEq}>
        EQ ▸
      </button>

      <div style={{ display: "flex", gap: 4 }}>
        <button
          style={{ ...toggle, ...(muted ? { background: "#dc2626", color: "#fff" } : {}) }}
          onClick={() => {
            channel.params.muted.value = !muted;
          }}
        >
          M
        </button>
        <button
          style={{ ...toggle, ...(soloed ? { background: "#eab308", color: "#180c02" } : {}) }}
          onClick={() => {
            channel.params.soloed.value = !soloed;
          }}
        >
          S
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 4 }}>
        <FaderMeter channel={channel} />
      </div>
    </div>
  );
}

// Local composition so the strip stays one file.
function FaderMeter({ channel }: { channel: Channel }) {
  return (
    <>
      <Fader param={channel.params.volume} height={110} />
      <Meter level={channel.cells.level} height={110} />
    </>
  );
}

const strip: CSSProperties = {
  width: 120,
  background: "rgba(8,10,18,0.9)",
  border: "1px solid",
  borderRadius: 6,
  padding: 8,
  color: "#cde",
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  pointerEvents: "auto",
};
const name: CSSProperties = { textAlign: "center", borderRadius: 3, padding: "2px 0", color: "#06140a", fontWeight: 600 };
const headerBtn: CSSProperties = {
  background: "#0c0c16",
  border: "1px solid #22d3ee55",
  color: "#22d3ee",
  borderRadius: 3,
  padding: "4px 0",
  cursor: "pointer",
  font: "inherit",
};
const toggle: CSSProperties = {
  flex: 1,
  background: "#1a1a2e",
  border: "1px solid #ffffff22",
  color: "#9be",
  borderRadius: 3,
  padding: "3px 0",
  cursor: "pointer",
  font: "inherit",
};
