import { useEffect, useState } from "react";
import { effect as alienEffect } from "alien-signals";
import { useValue } from "@audiorective/react";
import type { GraphSnapshot } from "@audiorective/core";
import { useEngine } from "../audio/engine";

/** Live table of the rack's last graph solve: every node's latency/arrival, and the edges that needed compensation to stay in time. */
export function GraphReadout() {
  const { core, rack: rackCell } = useEngine();
  const rack = useValue(rackCell);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => rack.graph.snapshot());
  const [pitchPathLatency, setPitchPathLatency] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      setSnapshot(rack.graph.snapshot());
      try {
        setPitchPathLatency(core.getPathLatency(rack.inserts.pitchShift));
      } catch {
        setPitchPathLatency(null);
      }
    };
    refresh();
    // `core.latency` bumps on every re-solve anywhere in the engine, so this effect
    // catches a graph change even between the 500 ms poll ticks below.
    const stopWatch = alienEffect(() => {
      core.latency.$();
      refresh();
    });
    const interval = setInterval(refresh, 500);
    return () => {
      stopWatch();
      clearInterval(interval);
    };
  }, [rack, core]);

  const compensatedEdges = snapshot.edges.filter((e) => e.compensationSamples > 0);
  const labelOf = (id: number) => snapshot.nodes.find((n) => n.id === id)?.label ?? `#${id}`;

  return (
    <section className="graph">
      <header className="module__head">
        <span className="module__title">Signal graph</span>
      </header>
      <p className="graph__path">
        Pitch-shift path to output: <span className="graph__mono">{pitchPathLatency ?? "—"}</span> smp
      </p>
      <div className="graph__tables">
        <table className="graph__table">
          <caption>Nodes</caption>
          <thead>
            <tr>
              <th>Node</th>
              <th>Latency</th>
              <th>Arrival</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.nodes.map((n) => (
              <tr key={n.id}>
                <td>{n.label}</td>
                <td>{n.latency}</td>
                <td>{n.arrival}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="graph__table">
          <caption>Compensated edges</caption>
          <thead>
            <tr>
              <th>Edge</th>
              <th>Compensation</th>
            </tr>
          </thead>
          <tbody>
            {compensatedEdges.length === 0 && (
              <tr>
                <td colSpan={2} className="graph__empty">
                  none
                </td>
              </tr>
            )}
            {compensatedEdges.map((e, i) => (
              <tr key={i}>
                <td>
                  {labelOf(e.from)} → {labelOf(e.to)}
                  {e.label ? ` (${e.label})` : ""}
                </td>
                <td>{e.compensationSamples} smp</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
