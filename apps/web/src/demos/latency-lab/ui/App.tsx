import { useEffect, useState } from "react";
import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { EngineProvider, engine } from "../audio/engine";
import { GraphDiagram } from "./GraphDiagram";
import { Controls } from "./Controls";
import { FlashRow } from "./FlashRow";
import "./styles.css";

function Hint() {
  const state = useValue<EngineState>(engine.core.state);
  if (state === "running") return null;
  return <p className="app__hint">Press Play to enable audio</p>;
}

function Ready() {
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

  if (error) return <p className="app__hint">Limiter failed to load: {error}</p>;
  if (!ready) return <p className="app__hint">Loading limiter…</p>;

  return (
    <>
      <GraphDiagram />
      <Controls />
      <FlashRow />
    </>
  );
}

export function App() {
  return (
    <EngineProvider>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">Latency Lab</h1>
          <p className="app__subtitle">
            A drum kit split into a lookahead-limited path and a dry path — watch <code>defineGraph</code> rewire live and PDC snap the two into
            sample alignment.
          </p>
        </header>

        <Hint />
        <Ready />
      </main>
    </EngineProvider>
  );
}
