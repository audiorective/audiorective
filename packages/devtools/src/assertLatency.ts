import type { AudioProcessor } from "@audiorective/core";
import { measureLatencyDetailed } from "./measureLatency";
import type { LatencyRun, MeasureOptions } from "./measureLatency";

function allPairsConstant(runs: LatencyRun[], tolerance: number): boolean {
  if (runs.length < 2) return false;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      if (Math.abs(runs[i].firstArrival - runs[j].firstArrival) > tolerance) return false;
    }
  }
  return true;
}

function allPairsScale(runs: LatencyRun[], tolerance: number): boolean {
  if (runs.length < 2) return false;
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      const diffSeconds = Math.abs(a.firstArrival / a.sampleRate - b.firstArrival / b.sampleRate);
      const factor = Math.max(a.sampleRate, b.sampleRate);
      if (diffSeconds * factor > tolerance) return false;
    }
  }
  return true;
}

// The shortest decimal (up to 6 places) whose seconds value, times each run's
// sample rate and rounded, reproduces that run's measured firstArrival.
function findSeconds(runs: LatencyRun[]): number {
  const base = runs[0];
  for (let decimals = 1; decimals <= 6; decimals++) {
    const factor = 10 ** decimals;
    const candidate = Math.round((base.firstArrival / base.sampleRate) * factor) / factor;
    if (runs.every((r) => Math.round(candidate * r.sampleRate) === r.firstArrival)) {
      return candidate;
    }
  }
  const factor = 10 ** 6;
  return Math.round((base.firstArrival / base.sampleRate) * factor) / factor;
}

function formatMismatch(name: string, declared: number, runs: LatencyRun[], tolerance: number): string {
  const measured = runs.map((r) => `${r.firstArrival} @${r.sampleRate}`).join(" · ");
  const peaks = runs.map((r) => r.peak).join(" · ");

  const lines = [`${name} latency mismatch`, `  declared   ${declared}`, `  measured   ${measured}   (first arrival; peak ${peaks})`, ""];

  if (allPairsConstant(runs, tolerance)) {
    lines.push("  Constant across sample rates — declare it in samples:");
    lines.push(`    latency: ${runs[0].firstArrival}`);
  } else if (allPairsScale(runs, tolerance)) {
    const seconds = findSeconds(runs);
    lines.push("  Measured latency scales with sample rate — declare it as time:");
    lines.push(`    latency: Math.round(${seconds} * ctx.sampleRate)`);
  } else {
    lines.push("  Latency fits neither a samples nor a time model; measure by hand.");
  }

  return lines.join("\n");
}

/**
 * Measures `build`'s processor and throws if its measured latency doesn't match
 * its declared latency (within `tolerance`) at every sample rate tested, and the
 * measured runs themselves agree on either a samples or a time model.
 */
export async function assertLatency(
  build: (ctx: BaseAudioContext) => AudioProcessor,
  opts: MeasureOptions & { tolerance?: number } = {},
): Promise<void> {
  const { tolerance = 1, ...measureOpts } = opts;
  const { declared, runs } = await measureLatencyDetailed(build, measureOpts);

  // Each run is checked against its own declared value: a time-based declaration
  // resolves to a different sample count per rate, so the last run's declared
  // value (all `declared` above carries) isn't a valid check for the others.
  const eachOk = runs.every((r) => Math.abs(r.firstArrival - r.declaredAtRate) <= tolerance);
  const modelOk = runs.length < 2 || allPairsConstant(runs, tolerance) || allPairsScale(runs, tolerance);
  if (eachOk && modelOk) return;

  const sampleRates = measureOpts.sampleRates ?? [44100, 48000];
  const nameCtx = new OfflineAudioContext(measureOpts.channels ?? 2, 1, sampleRates[0]);
  const namedProc = build(nameCtx);
  const name = namedProc.constructor.name;
  namedProc.destroy();

  throw new Error(formatMismatch(name, declared, runs, tolerance));
}
