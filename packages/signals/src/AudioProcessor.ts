import { computed as alienComputed, effect as alienEffect, type Effect } from "alien-signals";
import type { ParamOptions, ProcessorState } from "./types";
import { Param } from "./Param";
import { SchedulableParam } from "./SchedulableParam";

/**
 * Base class for audio processing units.
 * Provides param(), computed(), and effect() helpers that wire reactive
 * signals to Web Audio nodes. Subclasses declare parameters and audio
 * routing; the base class handles lifecycle, state serialization, and cleanup.
 */

type ParamFactoryOptions<T> = ParamOptions<T> & {
  schedulable?: boolean;
  syncInterval?: number;
  audioParam?: AudioParam;
};

export abstract class AudioProcessor {
  readonly context: AudioContext;
  private _effects: Effect<void>[] = [];
  private readonly _silencer: GainNode;
  private _constantSources = new Set<ConstantSourceNode>();

  protected constructor(context: AudioContext) {
    this.context = context;

    // constant source won't change offset if it's not in an active graph
    // so we connect all constant sources to a silent node
    this._silencer = new GainNode(context);
    this._silencer.gain.value = 0;
    this._silencer.connect(context.destination);
  }

  abstract get output(): AudioNode | undefined;

  protected param<T extends number>(options: ParamOptions<T> & { schedulable: true }): SchedulableParam;
  protected param<T extends number>(options: ParamOptions<T> & { audioParam: AudioParam }): SchedulableParam;
  protected param<T>(options: ParamOptions<T>): Param<T>;
  protected param<T>(options: ParamFactoryOptions<T>): Param<T> | SchedulableParam {
    if (typeof options.default !== "number" || (!options.schedulable && !options.audioParam)) {
      return new Param({ default: options.default });
    }

    let audioParam = options.audioParam;
    if (!audioParam) {
      const constantSource = this.context.createConstantSource();
      constantSource.connect(this._silencer);
      constantSource.start();
      this._constantSources.add(constantSource);
      audioParam = constantSource.offset;
    }

    return new SchedulableParam({
      default: options.default,
      audioContext: this.context,
      audioParam,
    });
  }

  protected computed<T>(fn: () => T) {
    return alienComputed(fn);
  }

  protected effect(fn: () => void): Effect<void> {
    const eff = alienEffect(fn);
    this._effects.push(eff);
    return eff;
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
      if (param instanceof SchedulableParam) {
        param.destroy();
      }
    }

    for (const source of this._constantSources) {
      source.disconnect();
    }
    this._constantSources = new Set();
  }
}
