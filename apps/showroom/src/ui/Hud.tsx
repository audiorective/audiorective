import { useEffect, useState, type CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { matchAction } from "../config/appConfig";
import { ChannelMenu } from "./ChannelMenu";
import { ChannelStrip } from "./ChannelStrip";
import { EqPanel } from "./EqPanel";
import { PanningPanel } from "./PanningPanel";
import { MixerPanel } from "./MixerPanel";
import { PadPanel } from "./PadPanel";

type View = { kind: "none" } | { kind: "channel"; id: string } | { kind: "eq"; id: string } | { kind: "panning"; id: string } | { kind: "mixer" };

export function Hud() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "none" });
  const headphone = useValue(engine.mixer.params.headphone);

  // Mirror HUD visibility into shared engine state (scene reads it for pointer-lock).
  useEffect(() => {
    engine.ui.update((d) => {
      d.hudOpen = open;
    });
  }, [open]);

  // Global keys: toggle HUD, toggle headphone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchAction(e);
      if (action === "toggleHud") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (action === "toggleHeadphone") {
        e.preventDefault();
        engine.mixer.params.headphone.value = !engine.mixer.params.headphone.value;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectChannel = (id: string) => {
    engine.selectedChannelId.value = id;
    setView({ kind: "channel", id });
    setOpen(true);
  };

  return (
    <>
      {/* Always-visible top-right cluster */}
      <div style={cluster}>
        <button
          style={{ ...chip, ...(headphone ? { background: "rgba(234,179,8,0.3)", color: "#fff" } : {}) }}
          onClick={() => (engine.mixer.params.headphone.value = !headphone)}
        >
          🎧 Phones
        </button>
        <button style={chip} onClick={() => setOpen((o) => !o)}>
          {open ? "✕ Hide" : "☰ Mix"}
        </button>
      </div>

      {open && (
        <>
          {/* Bottom-left menu */}
          <div style={menuSlot}>
            <ChannelMenu
              activeView={view.kind === "channel" ? { kind: "channel", id: view.id } : view.kind === "mixer" ? { kind: "mixer" } : { kind: "none" }}
              onSelectChannel={selectChannel}
              onOpenMixer={() => setView({ kind: "mixer" })}
            />
          </div>

          {/* Active panel */}
          {view.kind === "channel" && (
            <div style={stripSlot}>
              <ChannelStrip
                channel={engine.channels.find((c) => c.id === view.id)!}
                onOpenEq={() => setView({ kind: "eq", id: view.id })}
                onOpenPanning={() => setView({ kind: "panning", id: view.id })}
              />
            </div>
          )}
          {view.kind === "eq" && (
            <div style={bigPanel}>
              <PanelHeader title="EQ" onBack={() => setView({ kind: "channel", id: view.id })} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <EqPanel />
              </div>
            </div>
          )}
          {view.kind === "panning" && (
            <div style={bigPanel}>
              <PanelHeader title="Panning" onBack={() => setView({ kind: "channel", id: view.id })} />
              <div style={{ flex: 1, minHeight: 0 }}>
                <PanningPanel />
              </div>
            </div>
          )}
          {view.kind === "mixer" && (
            <div style={mixerSlot}>
              <MixerPanel />
            </div>
          )}

          {/* Sampler pads (always available while HUD is open) */}
          <div style={padSlot}>
            <PadPanel />
          </div>
        </>
      )}
    </>
  );
}

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ color: "#22d3ee", fontSize: 12 }}>{title}</span>
      <button style={chip} onClick={onBack}>
        ◀ Back
      </button>
    </div>
  );
}

const base: CSSProperties = { position: "fixed", fontFamily: "system-ui, sans-serif", pointerEvents: "none" };
const cluster: CSSProperties = { ...base, top: 12, right: 12, display: "flex", gap: 6, pointerEvents: "auto" };
const chip: CSSProperties = {
  background: "rgba(8,10,18,0.82)",
  border: "1px solid #22d3ee44",
  color: "#9be",
  borderRadius: 5,
  padding: "5px 9px",
  fontSize: 12,
  cursor: "pointer",
};
const menuSlot: CSSProperties = { ...base, left: 12, bottom: 12, pointerEvents: "auto" };
const stripSlot: CSSProperties = { ...base, left: 130, bottom: 12, pointerEvents: "auto" };
const bigPanel: CSSProperties = {
  ...base,
  left: "50%",
  top: "50%",
  transform: "translate(-50%,-50%)",
  width: "min(60vw, 560px)",
  height: "min(50vh, 360px)",
  background: "rgba(8,10,18,0.9)",
  border: "1px solid #22d3ee66",
  borderRadius: 8,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  pointerEvents: "auto",
};
const mixerSlot: CSSProperties = { ...base, left: 130, bottom: 12, pointerEvents: "auto" };
const padSlot: CSSProperties = { ...base, right: 12, bottom: 12, pointerEvents: "auto" };
