import { useValue, useParam } from "@audiorective/react";
import { useState, useCallback } from "react";
import { useEngine } from "../audio/engine";

export function Transport() {
  const { masterSeq } = useEngine();
  const [bpm, setBpm] = useParam(masterSeq.bpm);
  const playing = useValue(masterSeq.playing);

  const [rampTarget, setRampTarget] = useState(180);
  const [rampDuration, setRampDuration] = useState(4);

  const togglePlay = useCallback(() => {
    if (masterSeq.playing.value) {
      masterSeq.stop();
    } else {
      masterSeq.start();
    }
  }, [masterSeq]);

  const handleBpmRamp = useCallback(() => {
    masterSeq.rampBpm(rampTarget, rampDuration);
  }, [masterSeq, rampTarget, rampDuration]);

  return (
    <div style={styles.transport}>
      <button onClick={togglePlay} style={styles.playButton}>
        {playing ? "⏹ Stop" : "▶ Play"}
      </button>

      <div style={styles.bpmSection}>
        <label style={styles.label}>BPM: {Math.round(bpm)}</label>
        <input type="range" min={40} max={300} value={bpm} onChange={(e) => setBpm(Number(e.target.value))} style={styles.slider} />
      </div>

      <div style={styles.rampSection}>
        <input
          type="number"
          value={rampTarget}
          onChange={(e) => setRampTarget(Number(e.target.value))}
          style={styles.numberInput}
          min={40}
          max={300}
        />
        <span style={styles.rampLabel}>in</span>
        <input
          type="number"
          value={rampDuration}
          onChange={(e) => setRampDuration(Number(e.target.value))}
          style={styles.numberInput}
          min={0.5}
          max={30}
          step={0.5}
        />
        <span style={styles.rampLabel}>s</span>
        <button onClick={handleBpmRamp} style={styles.rampButton}>
          Ramp BPM
        </button>
      </div>
    </div>
  );
}

const styles = {
  transport: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "12px 16px",
    background: "#151515",
    borderRadius: "8px",
    marginBottom: "12px",
    flexWrap: "wrap" as const,
    border: "1px solid #1e1e1e",
  },
  playButton: {
    padding: "8px 20px",
    fontSize: "1rem",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    minWidth: "100px",
  },
  bpmSection: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: 1,
    minWidth: "200px",
  },
  label: {
    fontSize: "0.875rem",
    color: "#aaa",
    minWidth: "80px",
  },
  slider: {
    flex: 1,
    accentColor: "#2563eb",
  },
  rampSection: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  rampLabel: {
    fontSize: "0.8rem",
    color: "#888",
  },
  numberInput: {
    width: "60px",
    padding: "4px 8px",
    background: "#222",
    color: "#e0e0e0",
    border: "1px solid #333",
    borderRadius: "4px",
    fontSize: "0.875rem",
  },
  rampButton: {
    padding: "6px 12px",
    background: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
};
