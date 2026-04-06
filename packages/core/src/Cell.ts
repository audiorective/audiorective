import { signal } from "alien-signals";
import { produce, type Draft } from "immer";
import type { SignalAccessor } from "./types";

export class Cell<T> {
  readonly $: SignalAccessor<T>;

  constructor(initial: T) {
    this.$ = signal(initial);
  }

  get value(): T {
    return this.$();
  }

  set value(v: T) {
    this.$(v);
  }

  update(recipe: (draft: Draft<T>) => void): void {
    this.$(produce(this.$(), recipe));
  }
}

export function cell<T>(initial: T): Cell<T> {
  return new Cell(initial);
}
