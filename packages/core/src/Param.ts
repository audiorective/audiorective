import { signal, type Signal, effect as alienEffect, type Effect } from "alien-signals";
import type { ParamOptions } from "./types";

export class Param<T> {
  readonly $: Signal<T>;
  readonly label?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly display?: (value: T) => string;
  private _effect?: Effect<void>;

  constructor(options: ParamOptions<T>) {
    this.$ = signal(options.default);
    this.label = options.label;
    this.min = options.min;
    this.max = options.max;
    this.step = options.step;
    this.display = options.display;
    if (options.bind?.set) {
      const setter = options.bind.set;
      this._effect = alienEffect(() => {
        setter(this.value);
      });
    }
  }

  get value(): T {
    return this.$.get();
  }

  set value(newValue: T) {
    this.$.set(newValue);
  }

  destroy(): void {
    this._effect?.stop();
    this._effect = undefined;
  }
}
