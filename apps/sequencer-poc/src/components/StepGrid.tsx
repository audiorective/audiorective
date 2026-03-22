import { useValue } from "@audiorective/react";
import { NOTES, noteToFreq } from "../audio/Sequencer";
import type { Sequencer } from "../audio/Sequencer";

export function StepGrid({ sequencer }: { sequencer: Sequencer }) {
  const steps = useValue(sequencer.steps);
  const currentStep = useValue(sequencer.currentStep);

  const freqToNote = (freq: number): string => {
    let closest = NOTES[0];
    let minDiff = Infinity;
    for (const note of NOTES) {
      const diff = Math.abs(noteToFreq(note) - freq);
      if (diff < minDiff) {
        minDiff = diff;
        closest = note;
      }
    }
    return closest;
  };

  return (
    <div style={styles.grid}>
      {steps.map((step, i) => (
        <div
          key={i}
          style={{
            ...styles.step,
            ...(currentStep === i ? styles.active : {}),
          }}
        >
          <button
            onClick={() => sequencer.toggleStep(i)}
            style={{
              ...styles.toggle,
              background: step.active ? "#2563eb" : "#222",
            }}
          >
            {i + 1}
          </button>
          <select value={freqToNote(step.frequency)} onChange={(e) => sequencer.setStepNote(i, noteToFreq(e.target.value))} style={styles.select}>
            {NOTES.map((note) => (
              <option key={note} value={note}>
                {note}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, 1fr)",
    gap: "8px",
    marginBottom: "16px",
  },
  step: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "6px",
    padding: "8px 4px",
    borderRadius: "6px",
    background: "#151515",
    transition: "box-shadow 0.1s",
  },
  active: {
    boxShadow: "0 0 0 2px #2563eb, 0 0 12px rgba(37, 99, 235, 0.4)",
  },
  toggle: {
    width: "40px",
    height: "40px",
    borderRadius: "6px",
    border: "1px solid #333",
    color: "white",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: "bold" as const,
  },
  select: {
    width: "100%",
    padding: "4px",
    background: "#222",
    color: "#e0e0e0",
    border: "1px solid #333",
    borderRadius: "4px",
    fontSize: "0.75rem",
  },
};
