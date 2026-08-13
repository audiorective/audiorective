import { describe, test, expect, vi } from "vitest";
import { effect } from "alien-signals";
import { TempoParam } from "../src/TempoParam";

function makeClock(startAt = 0) {
  let now = startAt;
  return {
    advance: (dt: number) => (now += dt),
    now: () => now,
  };
}

describe("TempoParam — construction & value", () => {
  test("reads back the default", () => {
    const clock = makeClock();
    const param = new TempoParam({ default: 120, now: clock.now });
    expect(param.value).toBe(120);
    expect(param.valueAtTime(0)).toBe(120);
  });

  test(".value = x is a step at now(), leaving future events intact", () => {
    const clock = makeClock(10);
    const param = new TempoParam({ default: 120, now: clock.now });
    param.setValueAtTime(180, 20); // future event
    param.value = 90; // step at t=10
    expect(param.value).toBe(90);
    expect(param.valueAtTime(15)).toBe(90);
    expect(param.valueAtTime(25)).toBe(180); // future event survives
  });

  test(".value = x updates the signal synchronously (no tick needed)", () => {
    const clock = makeClock(5);
    const param = new TempoParam({ default: 120, now: clock.now });
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(param.value);
    });
    param.value = 140;
    expect(seen).toEqual([120, 140]);
    stop();
  });
});

describe("TempoParam — scheduling API", () => {
  test("setValueAtTime schedules without touching the signal directly", () => {
    const clock = makeClock(0);
    const param = new TempoParam({ default: 120, now: clock.now });
    param.setValueAtTime(200, 50); // a future event
    expect(param.value).toBe(120); // signal unchanged until _refresh
    expect(param.valueAtTime(50)).toBe(200);
  });

  test("setValueAtTime returns this for chaining", () => {
    const param = new TempoParam({ default: 120, now: () => 0 });
    expect(param.setValueAtTime(100, 1)).toBe(param);
  });

  test("cancelScheduledValues / cancelAndHoldAtTime delegate to the curve", () => {
    const param = new TempoParam({ default: 120, now: () => 0 });
    param.setValueAtTime(140, 10);
    param.setValueAtTime(160, 20);
    param.cancelAndHoldAtTime(15);
    expect(param.valueAtTime(15)).toBe(140);
    expect(param.valueAtTime(100)).toBe(140);
  });

  test("linearRampToValueAtTime and exponentialRampToValueAtTime throw (V2)", () => {
    const param = new TempoParam({ default: 120, now: () => 0 });
    expect(() => param.linearRampToValueAtTime(140, 10)).toThrow(/V2/);
    expect(() => param.exponentialRampToValueAtTime(140, 10)).toThrow(/V2/);
  });

  test("has no setTargetAtTime member", () => {
    const param = new TempoParam({ default: 120, now: () => 0 });
    expect((param as unknown as Record<string, unknown>)["setTargetAtTime"]).toBeUndefined();
  });
});

describe("TempoParam — _refresh (internal, Clock-driven)", () => {
  test("_refresh pushes the curve value at `now` into the signal", () => {
    const param = new TempoParam({ default: 120, now: () => 0 });
    param.setValueAtTime(180, 10);
    expect(param.value).toBe(120);
    param._refresh(10);
    expect(param.value).toBe(180);
  });

  test("_refresh triggers reactive effects", () => {
    const param = new TempoParam({ default: 120, now: () => 0 });
    param.setValueAtTime(180, 10);
    const onChange = vi.fn();
    const stop = effect(() => {
      onChange(param.value);
    });
    onChange.mockClear();
    param._refresh(10);
    expect(onChange).toHaveBeenCalledWith(180);
    stop();
  });
});
