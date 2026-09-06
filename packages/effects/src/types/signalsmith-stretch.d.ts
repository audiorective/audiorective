declare module "signalsmith-stretch" {
  export interface StretchSchedule {
    output?: number;
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }
  // Every method is a message round-trip to the worklet; await it before relying on its effect.
  export interface StretchNode extends AudioNode {
    schedule(change: StretchSchedule): Promise<void>;
    start(when?: number): Promise<void>;
    stop(when?: number): Promise<void>;
    latency(): Promise<number>;
    configure(opts: { blockMs?: number | null; intervalMs?: number; splitComputation?: boolean; preset?: "default" | "cheaper" }): Promise<void>;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number } | void>;
  }
  export default function SignalsmithStretch(ctx: BaseAudioContext, channelOptions?: AudioWorkletNodeOptions): Promise<StretchNode>;
}
