export interface ParamOptions<T> {
  default: T;
}

export type { Computed } from "alien-signals";

export interface ProcessorState {
  version: number;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
