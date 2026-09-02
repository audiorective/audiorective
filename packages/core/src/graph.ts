import { effect } from "alien-signals";
import { AudioProcessor } from "./AudioProcessor";
import { SchedulableParam } from "./SchedulableParam";

// AudioWorkletNode has unknowable latency, so it can never appear as a graph endpoint —
// only an AudioProcessor that declares its own latency can wrap one. NotWorklet only
// rejects a concrete AudioWorkletNode (or subtype); a naked `AudioNode` passes through
// unchanged, so the exclusion only bites once `defineGraph` infers each edge's concrete
// endpoint types (see `ValidateEdges` below).
export type NotWorklet<T> = T extends { port: MessagePort; parameters: AudioParamMap } ? never : T;

export type GraphSource = AudioNode | AudioProcessor; // AudioWorkletNode excluded via NotWorklet<T>
export type GraphSink = AudioNode | AudioProcessor | AudioParam | SchedulableParam;

export interface EdgeOptions {
  output?: number;
  input?: number;
  label?: string;
}

export type GraphEdge = readonly [GraphSource, GraphSink] | readonly [GraphSource, GraphSink, EdgeOptions];
export type EdgeList = ReadonlyArray<GraphEdge | false | null | undefined>;

// Rewrites each edge's inferred endpoint types through NotWorklet, so passing a concrete
// AudioWorkletNode as either endpoint resolves that position to `never` and fails to typecheck.
type ValidateEdge<E> = E extends readonly [infer From, infer To, ...infer Rest] ? readonly [NotWorklet<From>, NotWorklet<To>, ...Rest] : E;
type ValidateEdges<E extends EdgeList> = { [K in keyof E]: E[K] extends GraphEdge ? ValidateEdge<E[K]> : E[K] };

export interface GraphOptions {
  context: BaseAudioContext;
  compensate?: boolean;
  owner?: AudioProcessor;
}

export interface GraphHandle {
  dispose(): void;
}

type Endpoint = AudioNode | AudioParam;

// One physical connection, keyed for diffing by identity + channel indices.
interface Wire {
  fromNode: AudioNode;
  to: Endpoint;
  output: number;
  input: number;
}

function assertNotWorklet(node: AudioNode): void {
  if (typeof AudioWorkletNode !== "undefined" && node instanceof AudioWorkletNode) {
    throw new Error("defineGraph: a bare AudioWorkletNode has unknowable latency — wrap it in an AudioProcessor that declares latency");
  }
}

const resolveFrom = (v: GraphSource): AudioNode => {
  if (v instanceof AudioProcessor) {
    const out = v.output;
    if (!out) throw new Error("defineGraph: processor used as source has no output");
    return out;
  }
  assertNotWorklet(v);
  return v;
};

const resolveTo = (v: GraphSink): Endpoint => {
  if (v instanceof AudioProcessor) {
    const inp = v.input;
    if (!inp) throw new Error("defineGraph: processor used as sink has no input");
    return inp;
  }
  if (v instanceof SchedulableParam) return v.audioParam;
  if (v instanceof AudioParam) return v;
  assertNotWorklet(v);
  return v;
};

function connectWire(w: Wire): void {
  if (w.to instanceof AudioParam) w.fromNode.connect(w.to, w.output);
  else w.fromNode.connect(w.to, w.output, w.input);
}

function disconnectWire(w: Wire): void {
  try {
    if (w.to instanceof AudioParam) w.fromNode.disconnect(w.to, w.output);
    else w.fromNode.disconnect(w.to, w.output, w.input);
  } catch {
    // Already gone (node disposed elsewhere); the goal is the absence of the connection.
  }
}

/**
 * Reactively wires `fn`'s declared edges into the graph, diffing against the
 * previous render so only added/removed connections touch the audio graph.
 */
export function defineGraph<const E extends EdgeList>(fn: () => readonly [...ValidateEdges<E>], options: GraphOptions): GraphHandle;
export function defineGraph(fn: () => EdgeList, options: GraphOptions): GraphHandle {
  let current = new Map<string, Wire>();
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (o: object) => ids.get(o) ?? (ids.set(o, nextId), nextId++);

  const apply = (edges: EdgeList) => {
    const next = new Map<string, Wire>();
    for (const e of edges) {
      if (!e) continue;
      const [from, to, opts] = e;
      const wire: Wire = {
        fromNode: resolveFrom(from),
        to: resolveTo(to),
        output: opts?.output ?? 0,
        input: opts?.input ?? 0,
      };
      next.set(`${idOf(wire.fromNode)}>${idOf(wire.to)}@${wire.output},${wire.input}`, wire);
    }
    for (const [k, w] of current) if (!next.has(k)) disconnectWire(w);
    for (const [k, w] of next) if (!current.has(k)) connectWire(w);
    current = next;
    resolve(edges);
  };

  const stop = effect(() => apply(fn()));

  return {
    dispose() {
      stop();
      for (const w of current.values()) disconnectWire(w);
      current = new Map();
    },
  };
}

// Latency compensation lands in a later task; for now this is a documented no-op.
function resolve(_edges: EdgeList): void {}
