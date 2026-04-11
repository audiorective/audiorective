export interface ParamBind<T> {
  get?: () => T;
  set?: (value: T) => void;
}

export interface ParamOptions<T> {
  default: T;
  bind?: ParamBind<T>;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  display?: (value: T) => string;
}

/**
 * alien-signals 3.x signal accessor — callable to read, callable with arg to write.
 */
export type SignalAccessor<T> = {
  (): T;
  (value: T): void;
};

/**
 * alien-signals 3.x computed — callable to read.
 */
export type ComputedAccessor<T> = () => T;

/**
 * Shared interface for any reactive container exposing a signal.
 * Both Param<T> and Cell<T> satisfy this.
 */
export interface Readable<T> {
  readonly $: SignalAccessor<T>;
  readonly value: T;
}

export type EngineState = "idle" | "running" | "suspended" | "destroyed";
