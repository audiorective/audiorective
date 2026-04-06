import { describe, test, expect } from "vitest";
import { effect } from "alien-signals";
import { Cell, cell } from "../src";

describe("Cell", () => {
  test("cell() factory creates with initial value", () => {
    const c = cell(42);
    expect(c).toBeInstanceOf(Cell);
    expect(c.value).toBe(42);
  });

  test(".value read/write", () => {
    const c = new Cell({ x: 1, y: 2 });
    expect(c.value).toEqual({ x: 1, y: 2 });
    c.value = { x: 10, y: 20 };
    expect(c.value).toEqual({ x: 10, y: 20 });
  });

  test(".$ exposes raw signal for reactivity", () => {
    const c = cell("hello");
    const values: string[] = [];
    effect(() => {
      values.push(c.$());
    });
    expect(values).toEqual(["hello"]);
    c.value = "world";
    expect(values).toEqual(["hello", "world"]);
  });

  test(".update() mutates via Immer draft", () => {
    const c = cell({ count: 0, label: "test" });
    c.update((draft) => {
      draft.count = 5;
    });
    expect(c.value).toEqual({ count: 5, label: "test" });
  });

  test(".update() works with arrays", () => {
    const c = cell([{ active: false }, { active: false }, { active: false }]);
    c.update((draft) => {
      draft[1].active = true;
    });
    expect(c.value).toEqual([{ active: false }, { active: true }, { active: false }]);
  });

  test(".update() produces new reference (triggers reactivity)", () => {
    const c = cell([{ active: false }]);
    const original = c.value;
    let reactCount = 0;
    effect(() => {
      c.$();
      reactCount++;
    });
    expect(reactCount).toBe(1);

    c.update((draft) => {
      draft[0].active = true;
    });

    expect(reactCount).toBe(2);
    expect(c.value).not.toBe(original);
  });

  test("Immer structural sharing preserves unchanged subtrees", () => {
    const nested = { deep: "value" };
    const c = cell([
      { name: "a", nested },
      { name: "b", nested: { deep: "other" } },
    ]);

    c.update((draft) => {
      draft[1].nested.deep = "changed";
    });

    expect(c.value[0].nested).toBe(nested);
    expect(c.value[1].nested.deep).toBe("changed");
  });
});
