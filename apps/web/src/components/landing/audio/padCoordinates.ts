export const MIN_CUTOFF = 180;
export const MAX_CUTOFF = 12000;
export const MAX_WET = 0.65;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function padToParams(x: number, y: number) {
  return { frequency: MIN_CUTOFF * (MAX_CUTOFF / MIN_CUTOFF) ** clamp(x), wet: (1 - clamp(y)) * MAX_WET };
}

export function paramsToPad(frequency: number, wet: number) {
  return { x: clamp(Math.log(Math.max(MIN_CUTOFF, frequency) / MIN_CUTOFF) / Math.log(MAX_CUTOFF / MIN_CUTOFF)), y: 1 - clamp(wet / MAX_WET) };
}
