import { Suspense, use } from "react";
import { engine } from "./audio/engine";
import { Transport } from "./components/Transport";
import { StepGrid } from "./components/StepGrid";
import { SynthPanel } from "./components/SynthPanel";
import { Automation } from "./components/Automation";

function StartScreen() {
  return (
    <div style={styles.landing}>
      <h1 style={styles.title}>Audiorective Sequencer POC</h1>
      <p style={styles.subtitle}>Reactive audio signals with Web Audio API</p>
      <button onClick={() => engine.init()} style={styles.startButton}>
        Start Audio Engine
      </button>
    </div>
  );
}

function SequencerUI() {
  use(engine.untilReady());

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Audiorective Sequencer</h1>
      <Transport sequencer={engine.sequencer} />
      <StepGrid sequencer={engine.sequencer} />
      <SynthPanel synth={engine.synth} />
      <Automation synth={engine.synth} sequencer={engine.sequencer} />
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<StartScreen />}>
      <SequencerUI />
    </Suspense>
  );
}

const styles = {
  landing: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: "#0a0a0a",
    color: "#e0e0e0",
    fontFamily: "system-ui, sans-serif",
  },
  title: {
    fontSize: "2rem",
    marginBottom: "0.5rem",
  },
  subtitle: {
    color: "#888",
    marginBottom: "2rem",
  },
  startButton: {
    padding: "12px 32px",
    fontSize: "1.1rem",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "24px",
    background: "#0a0a0a",
    minHeight: "100vh",
    color: "#e0e0e0",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    fontSize: "1.5rem",
    marginBottom: "24px",
    textAlign: "center" as const,
  },
};
