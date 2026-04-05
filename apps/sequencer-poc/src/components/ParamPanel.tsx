import type { Track } from "../audio/trackConfig";
import { InstrumentParams } from "./InstrumentParams";

interface ParamPanelProps {
  track: Track;
}

export function ParamPanel({ track }: ParamPanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={{ ...styles.trackDot, background: track.color }} />
        <span style={styles.trackName}>{track.label}</span>
      </div>
      <div style={styles.content}>
        <InstrumentParams synth={track.instrument.synth} accentColor={track.color} />
      </div>
    </div>
  );
}

const styles = {
  panel: {
    background: "#111",
    borderTop: "1px solid #222",
    padding: "16px 20px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "12px",
  },
  trackDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  trackName: {
    fontSize: "0.875rem",
    fontWeight: "bold" as const,
    color: "#e0e0e0",
    letterSpacing: "0.05em",
  },
  content: {
    maxWidth: "600px",
  },
};
