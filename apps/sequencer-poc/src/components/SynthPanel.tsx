import { useValue } from "@audiorective/react";
import type { StepSynth } from "../audio/StepSynth";

type Waveform = "sine" | "square" | "sawtooth" | "triangle";
const WAVEFORMS: Waveform[] = ["sine", "square", "sawtooth", "triangle"];

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  displayValue,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  displayValue?: string;
}) {
  return (
    <div style={styles.sliderRow}>
      <label style={styles.label}>{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.slider}
      />
      <span style={styles.valueDisplay}>{displayValue ?? value.toFixed(2)}</span>
    </div>
  );
}

export function SynthPanel({ synth }: { synth: StepSynth }) {
  const waveform = useValue(synth.waveform);
  const volume = useValue(synth.volume);
  const cutoff = useValue(synth.cutoff);
  const resonance = useValue(synth.resonance);
  const attack = useValue(synth.attack);
  const decay = useValue(synth.decay);

  return (
    <div style={styles.panel}>
      <h3 style={styles.heading}>Synth</h3>

      <div style={styles.waveformRow}>
        {WAVEFORMS.map((w) => (
          <button
            key={w}
            onClick={() => (synth.waveform.value = w)}
            style={{
              ...styles.waveformButton,
              background: waveform === w ? "#2563eb" : "#222",
            }}
          >
            {w}
          </button>
        ))}
      </div>

      <ParamSlider label="Volume" value={volume} min={0} max={1} onChange={(v) => (synth.volume.value = v)} />
      <ParamSlider
        label="Cutoff"
        value={cutoff}
        min={20}
        max={20000}
        step={1}
        onChange={(v) => (synth.cutoff.value = v)}
        displayValue={`${Math.round(cutoff)} Hz`}
      />
      <ParamSlider label="Resonance" value={resonance} min={0.1} max={30} step={0.1} onChange={(v) => (synth.resonance.value = v)} />
      <ParamSlider
        label="Attack"
        value={attack}
        min={0.001}
        max={1}
        step={0.001}
        onChange={(v) => (synth.attack.value = v)}
        displayValue={`${(attack * 1000).toFixed(0)} ms`}
      />
      <ParamSlider
        label="Decay"
        value={decay}
        min={0.01}
        max={2}
        step={0.01}
        onChange={(v) => (synth.decay.value = v)}
        displayValue={`${(decay * 1000).toFixed(0)} ms`}
      />
    </div>
  );
}

const styles = {
  panel: {
    padding: "16px",
    background: "#151515",
    borderRadius: "8px",
    marginBottom: "16px",
  },
  heading: {
    margin: "0 0 12px",
    fontSize: "1rem",
    color: "#aaa",
  },
  waveformRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  waveformButton: {
    flex: 1,
    padding: "8px",
    border: "1px solid #333",
    borderRadius: "4px",
    color: "white",
    cursor: "pointer",
    fontSize: "0.8rem",
    textTransform: "capitalize" as const,
  },
  sliderRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "8px",
  },
  label: {
    fontSize: "0.8rem",
    color: "#aaa",
    minWidth: "70px",
  },
  slider: {
    flex: 1,
    accentColor: "#2563eb",
  },
  valueDisplay: {
    fontSize: "0.8rem",
    color: "#888",
    minWidth: "70px",
    textAlign: "right" as const,
  },
};
