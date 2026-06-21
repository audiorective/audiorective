import { useEffect, useState, type CSSProperties } from "react";
import { useValue } from "@audiorective/react";
import { engine } from "../audio/engine";
import { matchAction } from "../config/appConfig";
import { EqPanel } from "./EqPanel";
import { PanningPanel } from "./PanningPanel";
import { MixerPanel } from "./MixerPanel";
import { PadPanel } from "./PadPanel";
import { DraggablePanel } from "./DraggablePanel";
import { WelcomeModal } from "./WelcomeModal";

const WELCOME_SEEN_KEY = "pa-welcome-seen";

export function Hud() {
  const [eqOpen, setEqOpen] = useState(false);
  const [panOpen, setPanOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_SEEN_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const headphone = useValue(engine.mixer.params.headphone);
  const selectedId = useValue(engine.selectedChannelId);
  const selectedLabel = engine.channels.find((c) => c.id === selectedId)?.label ?? "";

  // A floating panel being open means the player is mixing, not walking — let the
  // scene release pointer-lock so the cursor can drive the panels.
  useEffect(() => {
    const open = eqOpen || panOpen;
    engine.ui.update((d) => {
      d.hudOpen = open;
    });
  }, [eqOpen, panOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchAction(e) === "toggleHeadphone") {
        e.preventDefault();
        engine.mixer.params.headphone.value = !engine.mixer.params.headphone.value;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeHelp = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem(WELCOME_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Top-right: help + global headphone monitor toggle. */}
      <div style={cluster}>
        <button style={chip} onClick={() => setHelpOpen(true)} title="How to play">
          ? Help
        </button>
        <button
          style={{ ...chip, ...(headphone ? { background: "rgba(234,179,8,0.3)", color: "#fff" } : {}) }}
          onClick={() => (engine.mixer.params.headphone.value = !headphone)}
        >
          🎧 Phones
        </button>
      </div>

      {helpOpen && <WelcomeModal onClose={closeHelp} />}

      {/* Always-on mixer (bottom). */}
      <MixerPanel onOpenEq={() => setEqOpen(true)} onOpenPan={() => setPanOpen(true)} />

      {/* Sampler pads (always available). */}
      <div style={padSlot}>
        <PadPanel />
      </div>

      {eqOpen && (
        <DraggablePanel
          id="eq"
          title={`EQ · ${selectedLabel}`}
          onClose={() => setEqOpen(false)}
          defaultPos={{ x: 80, y: 90 }}
          width={380}
          height={260}
        >
          <EqPanel />
        </DraggablePanel>
      )}
      {panOpen && (
        <DraggablePanel id="pan" title="Panning (3D)" onClose={() => setPanOpen(false)} defaultPos={{ x: 480, y: 90 }} width={420} height={340}>
          <PanningPanel />
        </DraggablePanel>
      )}
    </>
  );
}

const cluster: CSSProperties = {
  position: "fixed",
  top: 12,
  right: 12,
  display: "flex",
  gap: 6,
  pointerEvents: "auto",
  fontFamily: "system-ui, sans-serif",
};
const chip: CSSProperties = {
  background: "rgba(8,10,18,0.82)",
  border: "1px solid #22d3ee44",
  color: "#9be",
  borderRadius: 5,
  padding: "5px 9px",
  fontSize: 12,
  cursor: "pointer",
};
const padSlot: CSSProperties = { position: "fixed", right: 12, bottom: 12, pointerEvents: "auto", fontFamily: "system-ui, sans-serif" };
