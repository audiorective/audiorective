import { describe, test, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { Param } from "@audiorective/signals";
import { useValue } from "../src/hooks";

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
