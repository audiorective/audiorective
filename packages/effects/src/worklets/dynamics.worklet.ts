export const DYNAMICS_WORKLET_NAME = "audiorective-dynamics";

// Feedforward stereo-linked dynamics processor. The soft-knee branch of the gain computer is
// only reachable when knee > 0 — at knee = 0 it divides by zero, so W > 0 gates it and the
// hard-knee branch (over < 0 ? xdb : T + over/R) is taken instead, which is exact at knee = 0.
export const DYNAMICS_WORKLET = /* js */ `
const RATIO_INFINITE = 1000;
class DynamicsProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -24, minValue: -100, maxValue: 0, automationRate: "k-rate" },
      { name: "ratio", defaultValue: 4, minValue: 1, maxValue: RATIO_INFINITE, automationRate: "k-rate" },
      { name: "knee", defaultValue: 6, minValue: 0, maxValue: 40, automationRate: "k-rate" },
      { name: "attack", defaultValue: 0.003, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "release", defaultValue: 0.25, minValue: 0.001, maxValue: 5, automationRate: "k-rate" },
      { name: "makeup", defaultValue: 0, minValue: 0, maxValue: 40, automationRate: "k-rate" },
    ];
  }
  constructor(options) {
    super();
    this.lookahead = Math.max(0, Math.round(options.processorOptions?.lookaheadSamples ?? 0));
    const size = this.lookahead + 128;
    this.rings = [new Float32Array(size), new Float32Array(size)];
    this.write = 0;
    this.env = 0;
    this.maxEnv = 0;
    this.sinceReport = 0;
  }
  process(inputs, outputs, p) {
    const input = inputs[0], output = outputs[0];
    const n = output[0].length;
    const T = p.threshold[0], R = p.ratio[0] >= RATIO_INFINITE ? Infinity : p.ratio[0], W = p.knee[0];
    const aA = p.attack[0] <= 0 ? 0 : Math.exp(-1 / (p.attack[0] * sampleRate));
    const aR = Math.exp(-1 / (p.release[0] * sampleRate));
    const makeup = p.makeup[0];
    const L = this.lookahead, rings = this.rings, size = rings[0].length;
    const inL = input[0], inR = input[1] ?? input[0];
    for (let i = 0; i < n; i++) {
      const w = (this.write + i) % size;
      rings[0][w] = inL ? inL[i] : 0;
      rings[1][w] = inR ? inR[i] : 0;
      // detector: peak over the lookahead window ending at the sample just written
      let x = 0;
      if (L === 0) {
        x = Math.max(Math.abs(rings[0][w]), Math.abs(rings[1][w]));
      } else {
        for (let k = 0; k <= L; k++) {
          const idx = (w - k + size) % size;
          const a = Math.abs(rings[0][idx]), b = Math.abs(rings[1][idx]);
          if (a > x) x = a; if (b > x) x = b;
        }
      }
      const xdb = 20 * Math.log10(Math.max(x, 1e-6));
      const over = xdb - T;
      let ydb;
      if (2 * over < -W) ydb = xdb;
      else if (W > 0 && 2 * Math.abs(over) <= W) ydb = xdb + ((1 / R - 1) * (over + W / 2) * (over + W / 2)) / (2 * W);
      else ydb = T + over / R;
      const gr = xdb - ydb;
      this.env = gr > this.env ? aA * this.env + (1 - aA) * gr : aR * this.env + (1 - aR) * gr;
      if (this.env > this.maxEnv) this.maxEnv = this.env;
      const gain = Math.pow(10, (makeup - this.env) / 20);
      const r = (w - L + size) % size;
      output[0][i] = rings[0][r] * gain;
      if (output[1]) output[1][i] = rings[1][r] * gain;
    }
    this.write = (this.write + n) % size;
    this.sinceReport += n;
    if (this.sinceReport >= 2048) {
      this.port.postMessage({ reduction: -this.maxEnv });
      this.maxEnv = 0; this.sinceReport = 0;
    }
    return true;
  }
}
registerProcessor("${DYNAMICS_WORKLET_NAME}", DynamicsProcessor);
`;
