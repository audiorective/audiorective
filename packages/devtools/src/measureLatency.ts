import type { AudioProcessor } from "@audiorective/core";

export interface MeasureOptions {
  sampleRates?: number[];
  channels?: number;
  windowSeconds?: number;
  threshold?: number;
}

export interface LatencyRun {
  sampleRate: number;
  firstArrival: number;
  peak: number;
}

export interface LatencyReport {
  declared: number;
  runs: LatencyRun[];
}

// A processor's declared latency can itself be a function of sample rate (a time-based
// declaration resolves to a different sample count per rate), so assertLatency needs each
// run's own declared value to check correctness — not just the last one, which is all the
// public LatencyReport carries for display.
interface DetailedRun extends LatencyRun {
  declaredAtRate: number;
}

interface DetailedLatencyReport {
  declared: number;
  runs: DetailedRun[];
}

async function measureLatencyDetailed(build: (ctx: BaseAudioContext) => AudioProcessor, opts: MeasureOptions = {}): Promise<DetailedLatencyReport> {
  const { sampleRates = [44100, 48000], channels = 2, windowSeconds = 1, threshold = 1e-4 } = opts;

  const runs: DetailedRun[] = [];
  let declared = 0;

  for (const sampleRate of sampleRates) {
    const ctx = new OfflineAudioContext(channels, Math.ceil(windowSeconds * sampleRate), sampleRate);
    const proc = build(ctx);
    if (!proc.input || !proc.output) {
      throw new Error("measureLatency: processor must expose input and output");
    }
    declared = proc.latency.value;

    try {
      const buffer = new AudioBuffer({ length: 1, sampleRate });
      buffer.getChannelData(0)[0] = 1;
      const src = new AudioBufferSourceNode(ctx, { buffer });
      src.connect(proc.input);
      proc.output.connect(ctx.destination);
      src.start(0);

      const rendered = await ctx.startRendering();

      let firstArrival = -1;
      let peak = 0;
      let peakAbs = 0;
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const a = Math.abs(data[i]);
          if (a > threshold && (firstArrival === -1 || i < firstArrival)) {
            firstArrival = i;
          }
          if (a > peakAbs) {
            peakAbs = a;
            peak = i;
          }
        }
      }

      if (firstArrival === -1) {
        throw new Error(
          "measureLatency: no output detected — is the processor audible in its default state? Set it (wet, gate) inside the build factory.",
        );
      }

      runs.push({ sampleRate, firstArrival, peak, declaredAtRate: declared });
    } finally {
      proc.destroy();
    }
  }

  return { declared, runs };
}

/**
 * Feeds a single-sample impulse into `proc.input` and measures where it
 * arrives at `proc.output`, at each sample rate in `opts.sampleRates`.
 */
export async function measureLatency(build: (ctx: BaseAudioContext) => AudioProcessor, opts: MeasureOptions = {}): Promise<LatencyReport> {
  const { declared, runs } = await measureLatencyDetailed(build, opts);
  return { declared, runs: runs.map((run) => ({ sampleRate: run.sampleRate, firstArrival: run.firstArrival, peak: run.peak })) };
}

export { measureLatencyDetailed };
export type { DetailedLatencyReport, DetailedRun };
