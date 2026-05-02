import { EngineProvider } from "./audio/engine";
import { Transport } from "./components/Transport";
import { TrackMatrix } from "./components/TrackMatrix";
import { ParamPanel } from "./components/ParamPanel";
import { SpatialPanner } from "./components/SpatialPanner";

function SequencerApp() {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Audiorective</h1>
      </header>

      <div style={styles.body}>
        <div style={styles.leftColumn}>
          <div style={styles.sequencer}>
            <Transport />
            <TrackMatrix />
          </div>
          <div style={styles.inspector}>
            <ParamPanel />
          </div>
        </div>
        <div style={styles.rightColumn}>
          <SpatialPanner />
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <EngineProvider>
      <SequencerApp />
    </EngineProvider>
  );
}

const styles = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100vh",
    background: "#0a0a0a",
    color: "#e0e0e0",
    fontFamily: "system-ui, sans-serif",
  },
  header: {
    padding: "12px 20px",
    borderBottom: "1px solid #1a1a1a",
    flexShrink: 0,
  },
  title: {
    fontSize: "1.1rem",
    margin: 0,
    color: "#666",
    fontWeight: "normal" as const,
    letterSpacing: "0.1em",
  },
  body: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    minHeight: 0,
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
    borderRight: "1px solid #1a1a1a",
    overflow: "hidden",
  },
  sequencer: {
    flex: 1,
    padding: "16px 20px",
    overflow: "auto" as const,
    minHeight: 0,
  },
  inspector: {
    flexShrink: 0,
    borderTop: "1px solid #1e1e1e",
  },
  rightColumn: {
    position: "relative" as const,
    minWidth: 0,
    minHeight: 0,
  },
};
