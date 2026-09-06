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
  export interface StretchNode extends AudioNode {
    schedule(change: StretchSchedule): void;
    start(when?: number): void;
    stop(when?: number): void;
    latency(): number;
    configure(opts: { blockMs?: number | null; intervalMs?: number; splitComputation?: boolean; preset?: "default" | "cheaper" }): void;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number } | void>;
  }
  export default function SignalsmithStretch(ctx: BaseAudioContext, channelOptions?: AudioWorkletNodeOptions): Promise<StretchNode>;
}
