export interface ParamBind<T> {
  get?: () => T;
  set?: (value: T) => void;
}

export interface ParamOptions<T> {
  default: T;
  bind?: ParamBind<T>;
}

export type { Computed } from "alien-signals";

export interface ProcessorState {
  version: number;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
