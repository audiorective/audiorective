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

export type { Computed } from "alien-signals";

export type EngineState = "idle" | "running" | "suspended" | "destroyed";

export interface ProcessorState {
  version: number;
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
