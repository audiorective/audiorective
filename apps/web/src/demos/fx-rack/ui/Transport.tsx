import { useState } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import type { DrumVoiceId } from "../../sequencer/audio/drumKit";
import { useEngine } from "../audio/engine";
import { exportBars, readSettings } from "../audio/exportBars";

const PADS: { id: DrumVoiceId; label: string }[] = [
  { id: "kick", label: "Kick" },
  { id: "snare", label: "Snare" },
  { id: "hat", label: "Hat" },
  { id: "clap", label: "Clap" },
];

function Hint() {
  const { core } = useEngine();
  const state = useValue<EngineState>(core.state);
  if (state === "running") return null;
  return <p className="app__hint">Press Play to enable audio</p>;
}

export function Transport() {
  const { core, rack: rackCell } = useEngine();
  const rack = useValue(rackCell);
  const playing = useValue(rack.deck.cells.isPlaying);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function togglePlay() {
    await core.start();
    if (playing) rack.stop();
    else rack.play();
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportBars(4, 120, readSettings(rack), rack.deck.buffer);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fx-rack.wav";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="transport">
      <Hint />
      <div className="transport__row">
        <button className="transport__button transport__button--primary" onClick={() => void togglePlay()}>
          {playing ? "Stop" : "Play"}
        </button>

        <div className="transport__pads">
          {PADS.map((pad) => (
            <button key={pad.id} className="transport__pad" onClick={() => rack.hit(pad.id)} aria-label={`Hit ${pad.label}`}>
              {pad.label}
            </button>
          ))}
        </div>

        <button className="transport__button transport__button--export" onClick={() => void handleExport()} disabled={exporting}>
          {exporting ? "Rendering…" : "Export 4 bars"}
        </button>
      </div>

      {exportError && <p className="transport__error">{exportError}</p>}
    </div>
  );
}
