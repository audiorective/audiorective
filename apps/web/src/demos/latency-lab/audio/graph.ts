import { Cell, Param, type AudioEngine, type GraphHandle, type GraphSnapshot } from "@audiorective/core";
import type { Beat } from "./Beat";
import type { Click } from "./Click";
import type { LookaheadLimiter } from "./LookaheadLimiter";

export interface LabNodes {
  beat: Beat;
  click: Click;
  split: GainNode;
  dry: GainNode;
  master: GainNode;
}

/**
 * Owns the demo's root graph: beat and click feed a split point that
 * branches into a limited ("wet") path and an unlimited ("dry") path, mixed
 * back into master. `limiterBypassed` drops the wet branch; `pdcEnabled`
 * controls whether the graph compensates the branches' latency difference so
 * they still land in phase.
 *
 * Constructible before the limiter exists — its worklet loads asynchronously
 * — so the first graph is dry/click-only (equivalent to a forced bypass);
 * `attach(limiter)` wires the limiter in once it's ready and rebuilds.
 */
export class Lab {
  readonly limiterBypassed = new Param<boolean>({ default: false, label: "Limiter bypassed" });
  readonly pdcEnabled = new Param<boolean>({ default: true, label: "PDC enabled" });
  /** Bumped on every graph solve — the diagram subscribes to this to redraw. */
  readonly solveTick = new Cell<number>(0);
  handle: GraphHandle;
  /** Set by `attach()` once the limiter worklet has loaded. */
  limiter?: LookaheadLimiter;

  private readonly _ctx: BaseAudioContext;
  private readonly _nodes: LabNodes;
  private readonly _defineGraph: AudioEngine["defineGraph"];

  constructor(ctx: BaseAudioContext, nodes: LabNodes, defineGraph: AudioEngine["defineGraph"]) {
    this._ctx = ctx;
    this._nodes = nodes;
    this._defineGraph = defineGraph;
    this.handle = this._build(this.pdcEnabled.value);
  }

  private _build(compensate: boolean): GraphHandle {
    const { beat, click, split, dry, master } = this._nodes;
    return this._defineGraph(
      () => {
        const limiter = this.limiter;
        // Bypass removes the wet branch outright — it adds no direct split->master
        // edge, since dry->master is always present and a second copy would double
        // the signal (+6 dB) rather than actually bypass anything.
        return [
          [beat, split],
          limiter && !this.limiterBypassed.value && [split, limiter, { label: "wet" }],
          limiter && !this.limiterBypassed.value && [limiter, master],
          [split, dry, { label: "dry" }],
          [dry, master],
          [click, master, { label: "click" }],
          [master, this._ctx.destination],
        ];
      },
      { compensate, onSolve: () => this.solveTick.update((n) => n + 1) },
    );
  }

  /** Wires the limiter into the graph once its worklet has loaded, and rebuilds. */
  attach(limiter: LookaheadLimiter): void {
    this.limiter = limiter;
    this.handle.dispose();
    this.handle = this._build(this.pdcEnabled.value);
  }

  /** Disposes the current root graph and rebuilds it with compensation on/off. */
  setPdc(enabled: boolean): void {
    if (enabled === this.pdcEnabled.value) return;
    this.handle.dispose();
    this.handle = this._build(enabled);
    this.pdcEnabled.value = enabled;
  }

  snapshot(): GraphSnapshot {
    return this.handle.snapshot();
  }
}
