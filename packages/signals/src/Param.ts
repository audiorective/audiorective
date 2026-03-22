import { signal, type Signal } from "alien-signals";
import type { ParamOptions } from "./types";

/**
 * Reactive parameter backed by an alien-signals signal.
 * The basic building block for all reactive state in audiorective.
 */
export class Param<T> {
  readonly $: Signal<T>;

  constructor(options: ParamOptions<T>) {
    this.$ = signal(options.default);
  }

  get value(): T {
    return this.$.get();
  }

  set value(newValue: T) {
    this.$.set(newValue);
  }
}
