import { AudioProcessor, Param, SchedulableParam } from "@audiorective/core";

type OscType = OscillatorType;

type DroneParams = {
  cutoff: SchedulableParam;
  level: SchedulableParam;
  gate: SchedulableParam;
  waveform: Param<OscType>;
};

/**
 * A single sustained voice: osc → lowpass → level → gate.
 *
 * Two gain stages, deliberately split so **no param is driven from two places
 * at once** (see the "Gotcha" in docs/pixijs.md):
 * - `level` is the user-owned volume — set immediately from the UI (puck drag).
 * - `gate` is the on/off envelope — only ever *ramped* by `setActive()`.
 *
 * Audible gain is `level * gate`. Because the continuous UI control and the
 * scheduled ramp live on different params, the rAF `ParamSync` poll never fights
 * a UI write. Everything audio lives here (the architecture rule); the Pixi
 * layer only reads params and writes `.value`.
 */
export class DroneSynth extends AudioProcessor<DroneParams> {
  private readonly osc: OscillatorNode;
  private readonly gate: GainNode;

  constructor(ctx: AudioContext) {
    const osc = new OscillatorNode(ctx, { type: "sawtooth", frequency: 110 });
    const filter = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 800, Q: 9 });
    const level = new GainNode(ctx, { gain: 0.85 });
    const gate = new GainNode(ctx, { gain: 0 });

    osc.connect(filter).connect(level).connect(gate);

    super(ctx, ({ param }) => ({
      params: {
        cutoff: param({ default: 800, label: "Cutoff", min: 80, max: 8000, bind: filter.frequency }),
        level: param({ default: 0.85, label: "Level", min: 0, max: 1, bind: level.gain }),
        gate: param({ default: 0, label: "Gate", min: 0, max: 1, bind: gate.gain }),
        waveform: param<OscType>({
          default: "sawtooth",
          label: "Waveform",
          bind: { get: () => osc.type, set: (v) => (osc.type = v) },
        }),
      },
    }));

    this.osc = osc;
    this.gate = gate;
    osc.start();
  }

  get output(): AudioNode {
    return this.gate;
  }

  /** Ramp the voice in/out via the `gate` envelope. Scheduling stays in the audio layer. */
  setActive(on: boolean, seconds = 0.4): void {
    const now = this.context.currentTime;
    this.params.gate.setValueAtTime(this.params.gate.value, now);
    this.params.gate.linearRampToValueAtTime(on ? 1 : 0, now + seconds);
  }

  override destroy(): void {
    super.destroy();
    this.osc.stop();
  }
}
