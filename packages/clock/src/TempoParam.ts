import { Param } from "@audiorective/core";
import type { ParamOptions } from "@audiorective/core";
import { TempoCurve } from "./TempoCurve";

export interface TempoParamOptions extends ParamOptions<number> {
  /** Audio-clock time source used to resolve `.value = x` writes to a step time. */
  now: () => number;
}

const V2_MESSAGE = (method: string) => `TempoParam.${method} is V2 (tempo ramps) — see docs/superpowers/specs/2026-07-04-clock-design.md`;

/**
 * Standalone event-list-backed tempo curve. Mirrors SchedulableParam's
 * scheduling API surface but is not a reuse of it: it needs to evaluate and
 * integrate the curve analytically (beatToTime), which an AudioParam backing
 * can never support. See the clock design spec, "TempoParam" section.
 */
export class TempoParam extends Param<number> {
  private readonly _curve: TempoCurve;
  private readonly _now: () => number;

  constructor(options: TempoParamOptions) {
    super(options);
    this._now = options.now;
    this._curve = new TempoCurve(options.default);
  }

  override get value(): number {
    return super.value;
  }

  /** A direct write is a step at `now` — leaves future scheduled events intact. */
  override set value(newValue: number) {
    const now = this._now();
    this._curve.setValueAtTime(newValue, now);
    super.value = newValue;
  }

  setValueAtTime(value: number, time: number): this {
    this._curve.setValueAtTime(value, time);
    return this;
  }

  cancelScheduledValues(time: number): this {
    this._curve.cancelScheduledValues(time);
    return this;
  }

  cancelAndHoldAtTime(time: number): this {
    this._curve.cancelAndHoldAtTime(time);
    return this;
  }

  /** Query the curve at an arbitrary time — the AudioParam-backed sibling can never do this. */
  valueAtTime(time: number): number {
    return this._curve.valueAt(time);
  }

  linearRampToValueAtTime(_value: number, _endTime: number): this {
    throw new Error(V2_MESSAGE("linearRampToValueAtTime"));
  }

  exponentialRampToValueAtTime(_value: number, _endTime: number): this {
    throw new Error(V2_MESSAGE("exponentialRampToValueAtTime"));
  }

  /** @internal Pushed by the Clock tick to keep `.value` reflecting the curve at `now`. */
  _refresh(now: number): void {
    super.value = this._curve.valueAt(now);
  }

  /** @internal Timeline reads the curve directly for beat<->time integration. */
  get _curveForTimeline(): TempoCurve {
    return this._curve;
  }
}
