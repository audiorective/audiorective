import { useValue } from "@audiorective/react";
import type { Param } from "@audiorective/core";

type Waveform = "sine" | "square" | "sawtooth" | "triangle";
const WAVEFORMS: Waveform[] = ["sine", "square", "sawtooth", "triangle"];

interface WaveformPickerProps {
  param: Param<Waveform>;
  accentColor?: string;
}

export function WaveformPicker({ param, accentColor = "#2563eb" }: WaveformPickerProps) {
  const value = useValue(param);

  return (
    <div style={styles.row}>
      <span style={styles.label}>Waveform</span>
      <div style={styles.buttons}>
        {WAVEFORMS.map((w) => (
          <button
            key={w}
            onClick={() => {
              param.value = w;
            }}
            style={{
              ...styles.button,
              background: value === w ? accentColor : "#222",
            }}
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  label: {
    fontSize: "0.8rem",
    color: "#aaa",
    minWidth: "80px",
  },
  buttons: {
    display: "flex",
    gap: "6px",
    flex: 1,
  },
  button: {
    flex: 1,
    padding: "6px 4px",
    border: "1px solid #333",
    borderRadius: "4px",
    color: "white",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
};
