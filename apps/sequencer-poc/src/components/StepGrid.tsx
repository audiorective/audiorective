import { useValue } from "@audiorective/react";
import { TrackSequencer } from "../audio/TrackSequencer";
import type { DrumSequencer } from "../audio/DrumSequencer";
import { noteToFreq, freqToNote } from "../audio/trackConfig";

interface StepGridProps {
  seq: TrackSequencer | DrumSequencer;
  currentStep: number;
  accentColor: string;
  notes?: string[];
}

export function StepGrid({ seq, currentStep, accentColor, notes }: StepGridProps) {
  const steps = useValue(seq.steps);
  const isMelodic = notes !== undefined;

  return (
    <div style={styles.grid}>
      {steps.map((step, i) => (
        <div
          key={i}
          style={{
            ...styles.cell,
            boxShadow: currentStep === i ? `0 0 0 2px ${accentColor}, 0 0 10px ${accentColor}55` : "none",
          }}
        >
          <button
            onClick={() => seq.toggleStep(i)}
            style={{
              ...styles.toggle,
              background: step.active ? accentColor : "#1e1e1e",
            }}
          >
            {i + 1}
          </button>

          {isMelodic && (
            <select
              value={step.frequency !== undefined ? freqToNote(step.frequency, notes) : notes[0]}
              onChange={(e) => {
                if (seq instanceof TrackSequencer) {
                  seq.setStepNote(i, noteToFreq(e.target.value));
                }
              }}
              style={styles.select}
            >
              {notes.map((note) => (
                <option key={note} value={note}>
                  {note}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, 1fr)",
    gap: "4px",
    flex: 1,
  },
  cell: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
    padding: "4px 2px",
    borderRadius: "4px",
    background: "#0d0d0d",
    transition: "box-shadow 0.1s",
  },
  toggle: {
    width: "100%",
    height: "36px",
    borderRadius: "4px",
    border: "1px solid #2a2a2a",
    color: "white",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: "bold" as const,
  },
  select: {
    width: "100%",
    padding: "2px",
    background: "#1a1a1a",
    color: "#aaa",
    border: "1px solid #2a2a2a",
    borderRadius: "3px",
    fontSize: "0.7rem",
  },
};
