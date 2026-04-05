import type { Track } from "../audio/trackConfig";
import { StepGrid } from "./StepGrid";

interface TrackRowProps {
  track: Track;
  currentStep: number;
  isSelected: boolean;
  onSelect: () => void;
}

export function TrackRow({ track, currentStep, isSelected, onSelect }: TrackRowProps) {
  return (
    <div
      style={{
        ...styles.row,
        borderLeft: `4px solid ${track.color}`,
        background: isSelected ? "#161616" : "#111",
      }}
    >
      <button onClick={onSelect} style={styles.labelBtn}>
        <span style={styles.labelText}>{track.label}</span>
        {isSelected && <span style={{ ...styles.dot, background: track.color }} />}
      </button>

      <StepGrid seq={track.seq} currentStep={currentStep} accentColor={track.color} notes={track.instrument.notes} />
    </div>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "8px 12px",
    borderBottom: "1px solid #1a1a1a",
    minHeight: "70px",
  },
  labelBtn: {
    width: "72px",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "4px",
    padding: "6px 4px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    borderRadius: "4px",
  },
  labelText: {
    fontSize: "0.7rem",
    fontWeight: "bold" as const,
    color: "#ccc",
    letterSpacing: "0.08em",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
  },
};
