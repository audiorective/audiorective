import { computed as alienComputed, effect as alienEffect, type Effect } from "alien-signals";
import type { ParamBind, ParamOptions, ProcessorState } from "./types";
import { Param } from "./Param";
import { SchedulableParam } from "./SchedulableParam";

type ParamFactoryOptions<T> = ParamOptions<T> & {
  schedulable?: boolean;
  syncInterval?: number;
  bind?: ParamBind<T> | AudioParam;
};

export abstract class AudioProcessor {
  readonly context: AudioContext;
  private _effects: Effect<void>[] = [];
  private readonly _silencer: GainNode;
  private _constantSources = new Set<ConstantSourceNode>();

  protected constructor(context: AudioContext) {
    this.context = context;

    this._silencer = new GainNode(context);
    this._silencer.gain.value = 0;
    this._silencer.connect(context.destination);
  }

  abstract get output(): AudioNode | undefined;

  protected param<T extends number>(options: Omit<ParamOptions<T>, "bind"> & { bind: AudioParam }): SchedulableParam;
  protected param<T extends number>(options: ParamOptions<T> & { schedulable: true }): SchedulableParam;
  protected param<T>(options: ParamOptions<T> & { bind: ParamBind<T> }): Param<T>;
  protected param<T>(options: ParamOptions<T>): Param<T>;
  protected param<T>(options: ParamFactoryOptions<T>): Param<T> | SchedulableParam {
    const { bind } = options;

    if (bind instanceof AudioParam) {
      return new SchedulableParam({
        default: options.default as number,
        audioContext: this.context,
        audioParam: bind,
        label: options.label,
        min: options.min,
        max: options.max,
        step: options.step,
        display: options.display as ((value: number) => string) | undefined,
      });
    }

    if (options.schedulable) {
      const constantSource = this.context.createConstantSource();
      constantSource.connect(this._silencer);
      constantSource.start();
      this._constantSources.add(constantSource);

      return new SchedulableParam({
        default: options.default as number,
        audioContext: this.context,
        audioParam: constantSource.offset,
        label: options.label,
        min: options.min,
        max: options.max,
        step: options.step,
        display: options.display as ((value: number) => string) | undefined,
      });
    }

    return new Param(options);
  }

  protected computed<T>(fn: () => T) {
    return alienComputed(fn);
  }

  protected effect(fn: () => void): Effect<void> {
    const eff = alienEffect(fn);
    this._effects.push(eff);
    return eff;
  }

  getParams(): Map<string, Param<unknown>> {
    return this._discoverParams();
  }

  private _discoverParams(): Map<string, Param<unknown>> {
    const params = new Map<string, Param<unknown>>();
    for (const key of Object.keys(this)) {
      const val = (this as Record<string, unknown>)[key];
      if (val instanceof Param) {
        params.set(key, val);
      }
    }
    return params;
  }

  getParameter(name: string): Param<unknown> | undefined {
    return this._discoverParams().get(name);
  }

  getState(): ProcessorState {
    const parameters: Record<string, unknown> = {};
    for (const [key, param] of this._discoverParams()) {
      parameters[key] = param.value;
    }
    return { version: 1, parameters };
  }

  setState(state: ProcessorState): void {
    const params = this._discoverParams();
    for (const [key, value] of Object.entries(state.parameters)) {
      const param = params.get(key);
      if (param) {
        param.value = value;
      }
    }
  }

  destroy(): void {
    for (const eff of this._effects) {
      eff.stop();
    }
    this._effects = [];

    for (const [, param] of this._discoverParams()) {
      param.destroy();
    }

    for (const source of this._constantSources) {
      source.disconnect();
    }
    this._constantSources = new Set();
  }
}
