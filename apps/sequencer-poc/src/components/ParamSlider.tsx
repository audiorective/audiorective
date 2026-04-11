import { useValue } from "@audiorective/react";
import type { Param } from "@audiorective/core";

interface ParamSliderProps {
  param: Param<number>;
  accentColor?: string;
}

export function ParamSlider({ param, accentColor = "#2563eb" }: ParamSliderProps) {
  const value = useValue(param);
  const displayValue = param.display ? param.display(value) : value.toFixed(2);

  return (
    <div style={styles.row}>
      <label style={styles.label}>{param.label}</label>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step ?? 0.01}
        value={value}
        onChange={(e) => {
          param.value = Number(e.target.value);
        }}
        style={{ ...styles.slider, accentColor }}
      />
      <span style={styles.value}>{displayValue}</span>
    </div>
  );
}

const styles = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "8px",
  },
  label: {
    fontSize: "0.8rem",
    color: "#aaa",
    minWidth: "80px",
  },
  slider: {
    flex: 1,
  },
  value: {
    fontSize: "0.8rem",
    color: "#888",
    minWidth: "70px",
    textAlign: "right" as const,
  },
};
