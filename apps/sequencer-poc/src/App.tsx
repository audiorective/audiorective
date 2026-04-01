import { EngineProvider } from "./audio/engine";
import { Transport } from "./components/Transport";
import { StepGrid } from "./components/StepGrid";
import { SynthPanel } from "./components/SynthPanel";
import { Automation } from "./components/Automation";

export function App() {
  return (
    <EngineProvider>
      <div style={styles.container}>
        <h1 style={styles.header}>Audiorective Sequencer</h1>
        <Transport />
        <StepGrid />
        <SynthPanel />
        <Automation />
      </div>
    </EngineProvider>
  );
}

const styles = {
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
