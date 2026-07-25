import { useEffect, useState } from "react";
import { DrumMachine } from "../audio/DrumMachine";
import { createDrumKit } from "../audio/drumKit";
import { StepGrid } from "./StepGrid";
import { TransportBar } from "./TransportBar";
import "./styles.css";

interface Rig {
  ctx: AudioContext;
  machine: DrumMachine;
}

export function App() {
  const [rig, setRig] = useState<Rig | null>(null);

  // The context and the machine are torn down as one unit. Keeping them in a
  // single state value matters: with the context in a ref and `machine` as the
  // dependency, the null -> instance transition runs the *previous* render's
  // cleanup, which closed the context that had just been created (leaving
  // ctx.currentTime frozen and the playhead stuck at 1:1).
  useEffect(() => {
    if (!rig) return;
    return () => {
      rig.machine.destroy();
      void rig.ctx.close();
    };
  }, [rig]);

  // Browsers require a user gesture before an AudioContext can make sound, so
  // the whole machine is built on the first click rather than at mount.
  function powerOn() {
    const ctx = new AudioContext();
    void ctx.resume();
    setRig({ ctx, machine: new DrumMachine({ audioContext: ctx, kit: createDrumKit(ctx) }) });
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">Step Sequencer</h1>
        <p className="app__subtitle">
          <code>@audiorective/clock</code> driving a 4-track drum machine
        </p>
      </header>

      {rig ? (
        <>
          <TransportBar machine={rig.machine} />
          <StepGrid machine={rig.machine} />
          <footer className="app__footer">
            Every hit is scheduled by one <code>grid(16)</code> loop with <code>index % 16</code>; the playhead reads the bar ruler&rsquo;s reactive{" "}
            <code>current</code>.
          </footer>
        </>
      ) : (
        <button className="app__power" onClick={powerOn}>
          Power on
        </button>
      )}
    </main>
  );
}
