import { computed as alienComputed, effect as alienEffect } from "alien-signals";
import type { ParamBind, ParamOptions, ComputedAccessor } from "./types";
import { Param } from "./Param";
import { SchedulableParam } from "./SchedulableParam";
import { Cell } from "./Cell";

// Registry constraints use `any` rather than `unknown` because Param<T>/Cell<T> have
// T in both reader and writer position, making them invariant in T. Subclasses still
// get exact per-key types; the constraint only describes "an object of params/cells".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParamRegistry = Record<string, Param<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CellRegistry = Record<string, Cell<any>>;

export interface BuildHelpers {
  param<T extends number>(options: Omit<ParamOptions<T>, "bind"> & { bind: AudioParam }): SchedulableParam;
  param<T>(options: ParamOptions<T> & { bind: ParamBind<T> }): Param<T>;
  param<T>(options: ParamOptions<T>): Param<T>;
  schedulableParam(options: Omit<ParamOptions<number>, "bind"> & { bind?: AudioParam }): SchedulableParam;
  cell<T>(initial: T): Cell<T>;
}

type Undeclared<Msg extends string> = { [K in Msg]: never };
export type BuildResult<P extends ParamRegistry, C extends CellRegistry> = (string extends keyof P
  ? { params?: Undeclared<"Error: params not declared — add a P type parameter to AudioProcessor"> }
  : { params: P }) &
  (string extends keyof C ? { cells?: Undeclared<"Error: cells not declared — add a C type parameter to AudioProcessor"> } : { cells: C });

export abstract class AudioProcessor<P extends ParamRegistry = ParamRegistry, C extends CellRegistry = CellRegistry> {
  readonly context: AudioContext;
  readonly params: Readonly<P>;
  readonly cells: Readonly<C>;

  private readonly _silencer: GainNode;
  private _constantSources = new Set<ConstantSourceNode>();
  private _effects: (() => void)[] = [];

  protected constructor(context: AudioContext, build: (helpers: BuildHelpers) => BuildResult<P, C>) {
    this.context = context;

    this._silencer = new GainNode(context);
    this._silencer.gain.value = 0;
    this._silencer.connect(context.destination);

    const helpers: BuildHelpers = {
      param: (<T>(options: ParamOptions<T> & { bind?: ParamBind<T> | AudioParam }): Param<T> | SchedulableParam => {
        const { bind } = options;
        if (bind instanceof AudioParam) {
          return new SchedulableParam({
            default: options.default as number,
            audioContext: context,
            audioParam: bind,
            label: options.label,
            min: options.min,
            max: options.max,
            step: options.step,
            display: options.display as ((value: number) => string) | undefined,
          });
        }
        return new Param<T>(options as ParamOptions<T>);
      }) as BuildHelpers["param"],

      schedulableParam: (options) => {
        const { bind, ...rest } = options;
        if (bind) {
          return new SchedulableParam({
            ...rest,
            audioContext: context,
            audioParam: bind,
          });
        }
        // Unbound: create our own ConstantSourceNode kept alive by piping into the silencer.
        const cs = context.createConstantSource();
        cs.connect(this._silencer);
        cs.start();
        this._constantSources.add(cs);
        return new SchedulableParam({
          ...rest,
          audioContext: context,
          audioParam: cs.offset,
        });
      },

      cell: <T>(initial: T) => new Cell<T>(initial),
    };

    const result = build(helpers);
    this.params = Object.freeze("params" in result ? result.params : {}) as Readonly<P>;
    this.cells = Object.freeze("cells" in result ? result.cells : {}) as Readonly<C>;
  }

  abstract get output(): AudioNode | undefined;

  get input(): AudioNode | undefined {
    return undefined;
  }

  protected computed<T>(fn: () => T): ComputedAccessor<T> {
    return alienComputed(fn);
  }

  protected effect(fn: () => void): () => void {
    const stop = alienEffect(fn);
    this._effects.push(stop);
    return stop;
  }

  destroy(): void {
    for (const stop of this._effects) {
      stop();
    }
    this._effects = [];

    for (const param of Object.values(this.params)) {
      param.destroy();
    }

    for (const source of this._constantSources) {
      source.disconnect();
    }
    this._constantSources = new Set();
  }
}
