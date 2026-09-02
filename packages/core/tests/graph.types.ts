// Type-level checks for defineGraph's edge tuples, compiled by `pnpm typecheck`
// (packages/core/tsconfig.json includes this file). No runtime assertions here.
import { defineGraph } from "../src";

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
