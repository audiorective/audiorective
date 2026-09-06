import { EngineProvider } from "../audio/engine";
import type { FxRack } from "../audio/FxRack";
import { GraphReadout } from "./GraphReadout";
import { Meter } from "./Meter";
import { Module, type ModuleSpec } from "./Module";
import { Transport } from "./Transport";
import "./styles.css";

const insertSpecs: { key: string; title: string; pick: (rack: FxRack) => ModuleSpec }[] = [
  {
    key: "pitchShift",
    title: "Pitch shift",
    pick: (rack) => ({
      fader: { label: "Wet", param: rack.inserts.pitchShift.params.wet, min: 0, max: 1, step: 0.01 },
      knob: { label: "Pitch", param: rack.inserts.pitchShift.params.pitch, min: -24, max: 24, step: 1, format: (v) => `${v > 0 ? "+" : ""}${v} st` },
      latency: rack.inserts.pitchShift.latency,
      engine: rack.inserts.pitchShift.engine,
    }),
  },
  {
    key: "filter",
    title: "Filter",
    pick: (rack) => ({
      fader: { label: "Wet", param: rack.inserts.filter.params.wet, min: 0, max: 1, step: 0.01 },
      knob: { label: "Frequency", param: rack.inserts.filter.params.frequency, min: 20, max: 20000, step: 10, format: (v) => `${Math.round(v)} Hz` },
      latency: rack.inserts.filter.latency,
    }),
  },
  {
    key: "frequencyShifter",
    title: "Frequency shift",
    pick: (rack) => ({
      fader: { label: "Wet", param: rack.inserts.frequencyShifter.params.wet, min: 0, max: 1, step: 0.01 },
      knob: { label: "Shift", param: rack.inserts.frequencyShifter.params.frequency, min: -2000, max: 2000, step: 10, format: (v) => `${v} Hz` },
      latency: rack.inserts.frequencyShifter.latency,
    }),
  },
  {
    key: "distortion",
    title: "Distortion",
    pick: (rack) => ({
      fader: { label: "Wet", param: rack.inserts.distortion.params.wet, min: 0, max: 1, step: 0.01 },
      knob: { label: "Drive", param: rack.inserts.distortion.params.distortion, min: 0, max: 1, step: 0.01, format: (v) => v.toFixed(2) },
      latency: rack.inserts.distortion.latency,
    }),
  },
  {
    key: "phaser",
    title: "Phaser",
    pick: (rack) => ({
      fader: { label: "Wet", param: rack.inserts.phaser.params.wet, min: 0, max: 1, step: 0.01 },
      knob: { label: "Rate", param: rack.inserts.phaser.params.frequency, min: 0, max: 20, step: 0.1, format: (v) => `${v.toFixed(1)} Hz` },
      latency: rack.inserts.phaser.latency,
    }),
  },
];

const sendSpecs: { key: string; title: string; pick: (rack: FxRack) => ModuleSpec }[] = [
  {
    key: "delay",
    title: "Delay send",
    pick: (rack) => ({
      fader: { label: "Send", param: rack.sends.delay.send.gain, min: 0, max: 1, step: 0.01 },
      knob: {
        label: "Time",
        param: rack.sends.delay.effect.params.delayTime,
        min: 0,
        max: 1,
        step: 0.01,
        format: (v) => `${(v * 1000).toFixed(0)} ms`,
      },
      latency: rack.sends.delay.effect.latency,
    }),
  },
  {
    key: "reverb",
    title: "Reverb send",
    pick: (rack) => ({
      fader: { label: "Send", param: rack.sends.reverb.send.gain, min: 0, max: 1, step: 0.01 },
      latency: rack.sends.reverb.effect.latency,
    }),
  },
];

export function App() {
  return (
    <EngineProvider>
      <main className="app">
        <header className="app__header">
          <h1 className="app__title">FX Rack</h1>
          <p className="app__subtitle">
            <code>@audiorective/effects</code> — five inserts, two sends, and a compensated signal graph
          </p>
        </header>

        <Transport />

        <div className="rack">
          {insertSpecs.map((spec) => (
            <Module key={spec.key} title={spec.title} pick={spec.pick} />
          ))}
          {sendSpecs.map((spec) => (
            <Module key={spec.key} title={spec.title} pick={spec.pick} />
          ))}
          <Meter
            title="Compressor"
            pick={(rack) => ({
              reduction: rack.compressor.cells.reduction,
              threshold: { param: rack.compressor.params.threshold, min: -100, max: 0 },
            })}
          />
          <Meter
            title="Limiter"
            pick={(rack) => ({
              reduction: rack.limiter.cells.reduction,
              threshold: { param: rack.limiter.params.threshold, min: -100, max: 0 },
            })}
          />
        </div>

        <GraphReadout />

        <footer className="app__footer">
          Every insert's wet fader crossfades a compensated dry arm against the effect — the graph solver delays the dry path to match, so 0 and 1
          never phase against each other, only the mix in between changes.
        </footer>
      </main>
    </EngineProvider>
  );
}
