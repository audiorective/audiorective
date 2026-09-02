// Lookahead brickwall limiter: delays audio by `lookahead` samples so it can see a
// transient before it plays out, and scales the block down if that transient would
// exceed `ceiling`.
const MAX_LOOKAHEAD_SECONDS = 1;

class LookaheadLimiterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "ceiling", defaultValue: 0.9, minValue: 0, maxValue: 1, automationRate: "a-rate" }];
  }

  constructor() {
    super();
    this._maxLookahead = Math.round(sampleRate * MAX_LOOKAHEAD_SECONDS);
    this._lookahead = Math.round(0.02 * sampleRate);
    this._rings = [];
    this._writeHead = 0;

    // Changing lookahead moves the read head immediately; a click at that instant
    // is acceptable for this demo.
    this.port.onmessage = (event) => {
      const { lookahead } = event.data;
      if (typeof lookahead === "number" && lookahead > 0) {
        this._lookahead = Math.min(this._maxLookahead, Math.max(1, Math.round(lookahead)));
      }
    };
  }

  _ringFor(channel) {
    let ring = this._rings[channel];
    if (!ring) {
      ring = new Float32Array(this._maxLookahead);
      this._rings[channel] = ring;
    }
    return ring;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const channelCount = output.length;
    const blockSize = output[0] ? output[0].length : 128;
    const lookahead = this._lookahead;
    const ceiling = parameters.ceiling[0];
    const writeHead = this._writeHead;

    for (let channel = 0; channel < channelCount; channel++) {
      const ring = this._ringFor(channel);
      const ringLength = ring.length;
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < blockSize; i++) {
        ring[(writeHead + i) % ringLength] = inputChannel ? inputChannel[i] : 0;
      }

      // Peak over the window between the read head and the write head — the
      // samples already written but not yet emitted, including this block's output.
      const readHeadStart = (writeHead - lookahead + ringLength) % ringLength;
      let peak = 0;
      for (let i = 0; i < lookahead; i++) {
        const abs = Math.abs(ring[(readHeadStart + i) % ringLength]);
        if (abs > peak) peak = abs;
      }
      const gain = peak > ceiling ? ceiling / peak : 1;

      for (let i = 0; i < blockSize; i++) {
        outputChannel[i] = ring[(readHeadStart + i) % ringLength] * gain;
      }
    }

    this._writeHead = (writeHead + blockSize) % this._maxLookahead;
    return true;
  }
}

registerProcessor("lookahead-limiter", LookaheadLimiterProcessor);
