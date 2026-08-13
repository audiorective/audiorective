export type DrumVoiceId = "kick" | "snare" | "hat" | "clap";

export type DrumKit = Record<DrumVoiceId, AudioBuffer>;

/**
 * Deterministic pseudo-random noise source. Math.random() would make the kit
 * differ between runs, which makes test assertions (and A/B listening) fuzzy
 * for no benefit — a fixed LCG gives the same "noise" every time.
 */
function makeNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function createMonoBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  return ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
}

/** Sine sweeping 150 -> 45 Hz with an exponential amplitude decay. */
function renderKick(ctx: BaseAudioContext): AudioBuffer {
  const duration = 0.35;
  const buffer = createMonoBuffer(ctx, duration);
  const data = buffer.getChannelData(0);
  const sr = ctx.sampleRate;
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const progress = t / duration;
    const freq = 45 + (150 - 45) * Math.exp(-18 * t);
    phase += (2 * Math.PI * freq) / sr;
    const amp = Math.exp(-6 * t) * (1 - progress);
    data[i] = Math.sin(phase) * amp * 0.9;
  }
  return buffer;
}

/** 180 Hz triangle-ish body plus band-limited noise, fast decay. */
function renderSnare(ctx: BaseAudioContext): AudioBuffer {
  const duration = 0.2;
  const buffer = createMonoBuffer(ctx, duration);
  const data = buffer.getChannelData(0);
  const sr = ctx.sampleRate;
  const noise = makeNoise(0x5eed);
  let phase = 0;
  // one-pole state for a crude bandpass: highpassed noise minus its own lowpass
  let lowpass = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    phase += (2 * Math.PI * 180) / sr;
    const body = Math.sin(phase) * Math.exp(-30 * t) * 0.35;
    const raw = noise();
    lowpass += (raw - lowpass) * 0.35;
    const crack = (raw - lowpass) * Math.exp(-22 * t) * 0.6;
    data[i] = body + crack;
  }
  return buffer;
}

/** Highpassed noise, very fast decay. */
function renderHat(ctx: BaseAudioContext): AudioBuffer {
  const duration = 0.08;
  const buffer = createMonoBuffer(ctx, duration);
  const data = buffer.getChannelData(0);
  const sr = ctx.sampleRate;
  const noise = makeNoise(0xf00d);
  let lowpass = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const raw = noise();
    // aggressive highpass: keep only what the (fast) lowpass doesn't capture
    lowpass += (raw - lowpass) * 0.75;
    data[i] = (raw - lowpass) * Math.exp(-70 * t) * 0.5;
  }
  return buffer;
}

/** Three short noise bursts ~10ms apart into a short tail. */
function renderClap(ctx: BaseAudioContext): AudioBuffer {
  const duration = 0.15;
  const buffer = createMonoBuffer(ctx, duration);
  const data = buffer.getChannelData(0);
  const sr = ctx.sampleRate;
  const noise = makeNoise(0xc1a9);
  const burstOffsets = [0, 0.01, 0.02];
  let lowpass = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const raw = noise();
    lowpass += (raw - lowpass) * 0.5;
    const band = raw - lowpass;
    // each burst contributes a sharp decay from its own onset; the tail is a
    // slower decay from the last burst so the clap doesn't cut off abruptly
    let env = 0;
    for (const offset of burstOffsets) {
      if (t >= offset) env = Math.max(env, Math.exp(-120 * (t - offset)));
    }
    const tail = t >= 0.02 ? Math.exp(-25 * (t - 0.02)) * 0.4 : 0;
    data[i] = band * Math.max(env, tail) * 0.55;
  }
  return buffer;
}

/**
 * Synthesizes the whole kit into AudioBuffers. No binary assets: the demo
 * stays self-contained and every buffer is deterministic run-to-run.
 */
export function createDrumKit(ctx: BaseAudioContext): DrumKit {
  return {
    kick: renderKick(ctx),
    snare: renderSnare(ctx),
    hat: renderHat(ctx),
    clap: renderClap(ctx),
  };
}
