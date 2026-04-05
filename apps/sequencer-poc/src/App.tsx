import { useState } from "react";
import { EngineProvider, useEngine } from "./audio/engine";
import { Transport } from "./components/Transport";
import { TrackMatrix } from "./components/TrackMatrix";
import { ParamPanel } from "./components/ParamPanel";
import type { Track } from "./audio/trackConfig";

function SequencerApp() {
  const { tracks } = useEngine();
  const [selectedTrack, setSelectedTrack] = useState<Track>(tracks[0]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Audiorective</h1>
      </header>

      <main style={styles.main}>
        <Transport />
        <TrackMatrix selectedTrack={selectedTrack} onSelectTrack={setSelectedTrack} />
      </main>

      <footer style={styles.footer}>
        <ParamPanel track={selectedTrack} />
      </footer>
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
    minHeight: "100vh",
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
  main: {
    flex: 1,
    padding: "16px 20px",
    minWidth: "900px",
    overflowX: "auto" as const,
  },
  footer: {
    position: "sticky" as const,
    bottom: 0,
    flexShrink: 0,
    borderTop: "1px solid #1e1e1e",
  },
};
