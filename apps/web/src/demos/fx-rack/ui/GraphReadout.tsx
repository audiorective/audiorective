import { useEffect, useMemo, useState } from "react";
import { effect as alienEffect } from "alien-signals";
import { useValue } from "@audiorective/react";
import type { GraphSnapshot } from "@audiorective/core";
import type { FxRack } from "../audio/FxRack";
import { useEngine } from "../audio/engine";

/** Human names for every processor the rack owns, keyed by the graph id `idOf` gives it — the production build minifies `constructor.name`, so the snapshot's own node label isn't reliable there. */
function humanNamesFor(rack: FxRack): Map<number, string> {
  const names = new Map<number, string>();
  const add = (proc: Parameters<typeof rack.graph.idOf>[0], name: string) => {
    try {
      names.set(rack.graph.idOf(proc), name);
    } catch {
      // proc hasn't appeared in a solve yet — leave it to the snapshot's own label.
    }
  };
  add(rack.inserts.pitchShift, "Pitch shift");
  add(rack.inserts.filter, "Filter");
  add(rack.inserts.frequencyShifter, "Frequency shift");
  add(rack.inserts.distortion, "Distortion");
  add(rack.inserts.phaser, "Phaser");
  add(rack.sends.delay.effect, "Delay");
  add(rack.sends.reverb.effect, "Reverb");
  add(rack.compressor, "Compressor");
  add(rack.limiter, "Limiter");
  add(rack.channel, "Channel");
  add(rack.deck, "Deck");
  add(rack.pads.kick, "Kick pad");
  add(rack.pads.snare, "Snare pad");
  add(rack.pads.hat, "Hat pad");
  add(rack.pads.clap, "Clap pad");
  return names;
}

/** Live table of the rack's last graph solve: every node's latency/arrival, and the edges that needed compensation to stay in time. */
export function GraphReadout() {
  const { core, rack: rackCell } = useEngine();
  const rack = useValue(rackCell);
  const [snapshot, setSnapshot] = useState<GraphSnapshot>(() => rack.graph.snapshot());
  const [totalLatency, setTotalLatency] = useState<number | null>(null);
  const humanNames = useMemo(() => humanNamesFor(rack), [rack]);

  useEffect(() => {
    const refresh = () => {
      setSnapshot(rack.graph.snapshot());
      // The rack is never registered into an engine-owned graph (its output reaches
      // `ctx.destination` through a plain `.connect()`, outside any `defineGraph`), so
      // `engine.core.getPathLatency` can never resolve a path for it. The rack's own
      // graph handle knows its last solve directly, so read the total chain length —
      // arrival at the limiter's output — from there instead.
      try {
        setTotalLatency(rack.graph.arrivalOf(rack.limiter));
      } catch {
        setTotalLatency(null);
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
  const labelOf = (id: number) => humanNames.get(id) ?? snapshot.nodes.find((n) => n.id === id)?.label ?? `#${id}`;
  const totalMs = totalLatency !== null ? (totalLatency / rack.context.sampleRate) * 1000 : null;

  return (
    <section className="graph">
      <header className="module__head">
        <span className="module__title">Signal graph</span>
      </header>
      <p className="graph__path">
        Total path latency (to limiter output): <span className="graph__mono">{totalLatency ?? "—"}</span> smp /{" "}
        <span className="graph__mono">{totalMs !== null ? totalMs.toFixed(1) : "—"}</span> ms
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
                <td>{humanNames.get(n.id) ?? n.label}</td>
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
