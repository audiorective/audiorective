export type LfoShape = "sine" | "sawtooth" | "triangle";

function coefficient(shape: LfoShape, n: number): number {
  switch (shape) {
    case "sine":
      return n === 1 ? 1 : 0;
    case "sawtooth":
      return ((n % 2 === 1 ? 1 : -1) * 2) / (Math.PI * n);
    case "triangle":
      if (n % 2 === 0) return 0;
      return ((8 / (Math.PI * Math.PI)) * (((n - 1) / 2) % 2 === 0 ? 1 : -1)) / (n * n);
  }
}

/**
 * PeriodicWave for `shape` shifted by `phaseDeg`, `partials` harmonics.
 * Normalized the same way the built-in oscillator types are, so a phase-0 wave matches the
 * corresponding built-in shape and `Lfo`'s depth scaling can assume a ±1 peak.
 */
export function phasedWave(ctx: BaseAudioContext, shape: LfoShape, phaseDeg: number, partials = 1024): PeriodicWave {
  const phi = (phaseDeg * Math.PI) / 180;
  const real = new Float32Array(partials + 1);
  const imag = new Float32Array(partials + 1);
  for (let n = 1; n <= partials; n++) {
    const b = coefficient(shape, n);
    if (b === 0) continue;
    real[n] = b * Math.sin(n * phi);
    imag[n] = b * Math.cos(n * phi);
  }
  return ctx.createPeriodicWave(real, imag);
}

export interface LfoOptions {
  shape: LfoShape;
  phaseDeg?: number;
  frequency: number;
  min: number;
  max: number;
}

/** osc(−1..1) → depth gain → target, plus a constant centre → target. `setRange` retunes min/max. */
export class Lfo {
  private readonly osc: OscillatorNode;
  private readonly depth: GainNode;
  private readonly centre: ConstantSourceNode;
  readonly frequency: AudioParam;

  constructor(ctx: BaseAudioContext, opts: LfoOptions) {
    this.osc = new OscillatorNode(ctx, {
      frequency: opts.frequency,
      periodicWave: phasedWave(ctx, opts.shape, opts.phaseDeg ?? 0),
    });
    this.depth = new GainNode(ctx, { gain: 0 });
    this.centre = new ConstantSourceNode(ctx, { offset: 0 });
    this.osc.connect(this.depth);
    this.frequency = this.osc.frequency;
    this.setRange(opts.min, opts.max);
  }

  setRange(min: number, max: number): void {
    this.depth.gain.value = (max - min) / 2;
    this.centre.offset.value = (max + min) / 2;
  }

  connect(target: AudioParam): void {
    target.value = 0;
    this.depth.connect(target);
    this.centre.connect(target);
  }

  /** Feeds the LFO into a node's signal input (for arithmetic on the LFO itself). */
  connectNode(target: AudioNode): void {
    this.depth.connect(target);
    this.centre.connect(target);
  }

  start(when = 0): void {
    this.osc.start(when);
    this.centre.start(when);
  }

  stop(): void {
    try {
      this.osc.stop();
      this.centre.stop();
    } catch {
      /* not started */
    }
  }

  disconnect(): void {
    this.stop();
    this.osc.disconnect();
    this.depth.disconnect();
    this.centre.disconnect();
  }
}
