import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Param } from "@audiorective/core";
import { useValue, useParam } from "../src/hooks";

describe("useValue", () => {
  test("returns initial param value", () => {
    const p = new Param({ default: 42 });
    const { result } = renderHook(() => useValue(p));
    expect(result.current).toBe(42);
  });

  test("re-renders when param value changes", () => {
    const p = new Param({ default: "hello" });
    const { result } = renderHook(() => useValue(p));
    expect(result.current).toBe("hello");

    act(() => {
      p.value = "world";
    });

    expect(result.current).toBe("world");
  });

  test("tracks multiple updates", () => {
    const p = new Param({ default: 0 });
    const { result } = renderHook(() => useValue(p));

    act(() => {
      p.value = 1;
    });
    act(() => {
      p.value = 2;
    });
    act(() => {
      p.value = 3;
    });

    expect(result.current).toBe(3);
  });
});

describe("useParam", () => {
  test("returns [value, setter] tuple", () => {
    const p = new Param({ default: 42 });
    const { result } = renderHook(() => useParam(p));
    const [value, setValue] = result.current;
    expect(value).toBe(42);
    expect(typeof setValue).toBe("function");
  });

  test("setter updates the param value", () => {
    const p = new Param({ default: 0 });
    const { result } = renderHook(() => useParam(p));

    act(() => {
      result.current[1](99);
    });

    expect(result.current[0]).toBe(99);
    expect(p.value).toBe(99);
  });

  test("re-renders when param changes externally", () => {
    const p = new Param({ default: "hello" });
    const { result } = renderHook(() => useParam(p));

    act(() => {
      p.value = "world";
    });

    expect(result.current[0]).toBe("world");
  });

  test("setter reference is stable across renders", () => {
    const p = new Param({ default: 0 });
    const { result, rerender } = renderHook(() => useParam(p));
    const setter1 = result.current[1];

    act(() => {
      result.current[1](1);
    });

    rerender();
    const setter2 = result.current[1];
    expect(setter1).toBe(setter2);
  });
});
