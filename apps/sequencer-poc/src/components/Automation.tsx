import { useCallback } from "react";
import type { StepSynth } from "../audio/StepSynth";
import type { Sequencer } from "../audio/Sequencer";

export function Automation({ synth, sequencer: _sequencer }: { synth: StepSynth; sequencer: Sequencer }) {
  const handleFilterSweep = useCallback(() => {
    synth.filterSweep();
  }, [synth]);

  return (
    <div style={styles.panel}>
      <h3 style={styles.heading}>Automation</h3>
      <div style={styles.row}>
        <button onClick={handleFilterSweep} style={styles.button}>
          Filter Sweep (2s)
        </button>
        <span style={styles.hint}>Ramps cutoff up and back down — watch the slider move</span>
      </div>
    </div>
  );
}

const styles = {
  panel: {
    padding: "16px",
    background: "#151515",
    borderRadius: "8px",
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "1rem",
    color: "#aaa",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  button: {
    padding: "8px 20px",
    background: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.875rem",
  },
  hint: {
    fontSize: "0.8rem",
    color: "#666",
  },
};
