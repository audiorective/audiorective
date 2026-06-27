import { AudioProcessor, Param, SchedulableParam } from "@audiorective/core";

type OscType = OscillatorType;

type DroneParams = {
  cutoff: SchedulableParam;
  volume: SchedulableParam;
  waveform: Param<OscType>;
};

/**
 * A single sustained voice: osc → lowpass → master gain.
 *
 * Everything audio lives here (the architecture rule). The Pixi layer only
 * reads params and writes `.value` — it never touches AudioContext timing or
 * the node graph. The spectrum tap is a separate `Analyser` wired in the engine.
 */
export class DroneSynth extends AudioProcessor<DroneParams> {
  private readonly osc: OscillatorNode;
  private readonly gain: GainNode;

  constructor(ctx: AudioContext) {
    const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: 110 });
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 800, Q: 9 });
    const gain = new GainNode(ctx, { gain: 0 });

    osc.connect(filter).connect(gain);

    super(ctx, ({ param }) => ({
      params: {
        cutoff: param({ default: 800, label: "Cutoff", min: 80, max: 8000, bind: filter.frequency }),
        volume: param({ default: 0, label: "Volume", min: 0, max: 1, bind: gain.gain }),
        waveform: param<OscType>({
          default: "sawtooth",
          label: "Waveform",
          bind: { get: () => osc.type, set: (v) => (osc.type = v) },
        }),
      },
    }));

    this.osc = osc;
    this.gain = gain;
    osc.start();
  }

  get output(): AudioNode {
    return this.gain;
  }

  /** Ramp the voice in/out. Envelope scheduling stays in the audio layer. */
  setActive(on: boolean, seconds = 0.4): void {
    const now = this.context.currentTime;
    this.params.volume.setValueAtTime(this.params.volume.value, now);
    this.params.volume.linearRampToValueAtTime(on ? 0.85 : 0, now + seconds);
  }

  override destroy(): void {
    super.destroy();
    this.osc.stop();
  }
}
