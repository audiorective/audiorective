import type { AudioProcessor, Param } from "@audiorective/core";
import { ParamSlider } from "./ParamSlider";
import { WaveformPicker } from "./WaveformPicker";

type Waveform = "sine" | "square" | "sawtooth" | "triangle";

interface InstrumentParamsProps {
  synth: AudioProcessor;
  accentColor?: string;
}

export function InstrumentParams({ synth, accentColor }: InstrumentParamsProps) {
  const entries = Object.entries(synth.params) as [string, Param<unknown>][];
  const waveformParam = (synth.params as Record<string, Param<unknown> | undefined>).waveform as Param<Waveform> | undefined;
  const sliders = entries.filter(([key, p]) => key !== "waveform" && p.min !== undefined) as [string, Param<number>][];

  return (
    <>
      {waveformParam && <WaveformPicker param={waveformParam} accentColor={accentColor} />}
      {sliders.map(([key, param]) => (
        <ParamSlider key={key} param={param} accentColor={accentColor} />
      ))}
    </>
  );
}
