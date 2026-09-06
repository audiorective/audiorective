// Type-level checks for defineGraph's edge tuples, compiled by `pnpm typecheck`
// (packages/core/tsconfig.json includes this file). No runtime assertions here.
import { AudioProcessor, defineGraph } from "../src";

declare const ctx: BaseAudioContext;
declare const node: AudioNode;
declare const worklet: AudioWorkletNode;
declare const param: AudioParam;

// A bare AudioWorkletNode is never a valid sink — its latency is unknowable.
// @ts-expect-error
defineGraph(() => [[node, worklet]], { context: ctx });

// A bare AudioWorkletNode is never a valid source either.
// @ts-expect-error
defineGraph(() => [[worklet, node]], { context: ctx });

// An AudioParam can be a sink but never a source.
// @ts-expect-error
defineGraph(() => [[param, node]], { context: ctx });

// A processor that never narrows `input` past `AudioNode | undefined` — an output-only
// processor, or a bare AudioProcessor-typed reference — is not a valid sink.
class OutputOnly extends AudioProcessor {
  get output(): AudioNode | undefined {
    return node;
  }
}
declare const outputOnly: OutputOnly;
// @ts-expect-error
defineGraph(() => [[node, outputOnly]], { context: ctx });

// The protected instance method carries the same generic validation as the standalone
// export — a bare AudioWorkletNode through `this.defineGraph` is a compile error too.
class UsesGraph extends AudioProcessor {
  get output(): AudioNode | undefined {
    return node;
  }

  wire(): void {
    // @ts-expect-error
    this.defineGraph(() => [[node, worklet]]);
  }
}
declare const usesGraph: UsesGraph;
void usesGraph;
