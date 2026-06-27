import { AudioProcessor } from "./AudioProcessor";

export interface AnalyserOptions {
  /** FFT window size (power of two, 32–32768). Default 2048. */
  fftSize?: number;
  /** 0–1 time-averaging of frequency data. Default 0.8. */
  smoothingTimeConstant?: number;
  /** Lower bound of the dB range mapped onto byte frequency data. */
  minDecibels?: number;
  /** Upper bound of the dB range mapped onto byte frequency data. */
  maxDecibels?: number;
}

/**
 * A pass-through tap that exposes the realtime spectrum and waveform of audio
 * flowing through it. Wrap any node by wiring `source → analyser.input` and
 * `analyser.output → destination`.
 *
 * Analyser data is **not reactive** — it changes every audio frame with no
 * signal to subscribe to. Poll it from your render loop (`app.ticker`,
 * `requestAnimationFrame`, `useFrame`), not from an `effect()` or `useValue()`.
 *
 * ```ts
 * const analyser = new Analyser(ctx, { fftSize: 256 });
 * synth.output.connect(analyser.input);
 * analyser.output.connect(ctx.destination);
 *
 * const bins = analyser.createFrequencyBuffer();
 * // each frame:
 * analyser.readFrequencies(bins); // bins[i] = 0–255
 * ```
 */
export class Analyser extends AudioProcessor {
  readonly node: AnalyserNode;

  constructor(context: AudioContext, options: AnalyserOptions = {}) {
    const node = new AnalyserNode(context, {
      fftSize: options.fftSize ?? 2048,
      smoothingTimeConstant: options.smoothingTimeConstant ?? 0.8,
      ...(options.minDecibels !== undefined ? { minDecibels: options.minDecibels } : {}),
      ...(options.maxDecibels !== undefined ? { maxDecibels: options.maxDecibels } : {}),
    });
    super(context, () => ({}));
    this.node = node;
  }

  override get input(): AudioNode {
    return this.node;
  }

  get output(): AudioNode {
    return this.node;
  }

  /** Number of frequency bins (`fftSize / 2`) — the length of a frequency buffer. */
  get binCount(): number {
    return this.node.frequencyBinCount;
  }

  /** FFT window size — the length of a waveform buffer. */
  get fftSize(): number {
    return this.node.fftSize;
  }

  /** Allocate a byte buffer sized for {@link readFrequencies}. */
  createFrequencyBuffer(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.node.frequencyBinCount);
  }

  /** Allocate a byte buffer sized for {@link readWaveform}. */
  createWaveformBuffer(): Uint8Array<ArrayBuffer> {
    return new Uint8Array(this.node.fftSize);
  }

  /** Fill `out` with per-bin frequency magnitudes (0–255). Poll once per frame. */
  readFrequencies(out: Uint8Array<ArrayBuffer>): void {
    this.node.getByteFrequencyData(out);
  }

  /** Fill `out` with the time-domain waveform (0–255, 128 = silence). Poll once per frame. */
  readWaveform(out: Uint8Array<ArrayBuffer>): void {
    this.node.getByteTimeDomainData(out);
  }

  override destroy(): void {
    super.destroy();
    this.node.disconnect();
  }
}
