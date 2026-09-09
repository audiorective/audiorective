import { useEffect, useState } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { EngineProvider, engine } from "../audio/engine";
import { StepGrid } from "./StepGrid";
import { TransportBar } from "./TransportBar";
import { GraphDiagram } from "./GraphDiagram";
import { LatencyControls } from "./LatencyControls";
import "./styles.css";

function Hint() {
  const state = useValue<EngineState>(engine.core.state);
  if (state === "running") return null;
  return <p className="app__hint">Press Play to enable audio</p>;
}

/**
 * The latency lab renders only once the limiter's worklet has loaded and been
 * wired in. The sequencer above it does not wait: until then the machine
 * plays through the dry-only graph, exactly as if the limiter were bypassed.
 */
function LatencyLab() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    engine.ready.then(
      () => {
        if (!cancelled) setReady(true);
      },
      (err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="lab">
      <h2 className="lab__title">Latency lab</h2>
      <p className="lab__subtitle">
        The machine&rsquo;s output is split into a lookahead-limited path and a dry path, mixed back together — watch <code>defineGraph</code> rewire
        live and PDC snap the two into sample alignment.
      </p>
      {error ? (
        <p className="app__hint">Limiter failed to load: {error}</p>
      ) : !ready ? (
        <p className="app__hint">Loading limiter…</p>
      ) : (
        <>
          <GraphDiagram />
          <LatencyControls />
        </>
      )}
    </section>
  );
}

export function App() {
  return (
    <EngineProvider>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">Step Sequencer</h1>
          <p className="app__subtitle">
            <code>@audiorective/clock</code> driving a 4-track drum machine, routed through a <code>defineGraph</code> with delay compensation
          </p>
        </header>

        <Hint />
        <TransportBar />
        <StepGrid />
        <LatencyLab />

        <footer className="app__footer">
          Every hit is scheduled by one <code>grid(16)</code> loop over a cycle ruler. The playhead re-reads the same ruler at the time the listener
          is hearing — the render clock minus <code>engine.latency</code> and the output latency — so the highlight lands with the sound, however long
          the limiter&rsquo;s lookahead.
        </footer>
      </main>
    </EngineProvider>
  );
}
