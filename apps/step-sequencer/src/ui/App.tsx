import { useValue } from "@audiorective/react";
import type { EngineState } from "@audiorective/core";
import { EngineProvider, engine } from "../audio/engine";
import { StepGrid } from "./StepGrid";
import { TransportBar } from "./TransportBar";
import "./styles.css";

function Hint() {
  const state = useValue<EngineState>(engine.core.state);
  if (state === "running") return null;
  return <p className="app__hint">Press Play to enable audio</p>;
}

export function App() {
  return (
    <EngineProvider>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">Step Sequencer</h1>
          <p className="app__subtitle">
            <code>@audiorective/clock</code> driving a 4-track drum machine
          </p>
        </header>

        <Hint />
        <TransportBar />
        <StepGrid />

        <footer className="app__footer">
          Every hit is scheduled by one <code>grid(16)</code> loop with <code>index % 16</code>; the playhead reads the bar ruler&rsquo;s reactive{" "}
          <code>current</code>.
        </footer>
      </main>
    </EngineProvider>
  );
}
