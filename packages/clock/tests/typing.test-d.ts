import { test, expectTypeOf } from "vitest";
import { Timeline } from "../src/Timeline";
import { Clock } from "../src/Clock";
import { LinearBarRuler } from "../src/rulers/LinearBarRuler";
import type { LinearBarPoint, LinearBarWindow } from "../src/rulers/LinearBarRuler";

// Compile-time only: this file is never executed, only type-checked
// (packages/clock/tsconfig.json includes "tests", so `pnpm typecheck` covers it).

test("addRuler narrows Timeline.rulers.<key>.current to the ruler's point reading", () => {
  const ctx = { currentTime: 0 };
  const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

  expectTypeOf(timeline.rulers.bar.current.value).toEqualTypeOf<LinearBarPoint>();

  // @ts-expect-error -- "nope" was never registered via addRuler
  timeline.rulers.nope;
});

test("addRuler narrows TickWindow.rulers.<key> to the ruler's window reading", () => {
  const ctx = { currentTime: 0 };
  const timeline = new Timeline({ audioContext: ctx, bpm: 120 }).addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }));

  new Clock({
    timeline,
    onTick: (window) => {
      expectTypeOf(window.rulers.bar).toEqualTypeOf<LinearBarWindow>();
      // @ts-expect-error -- "nope" was never registered via addRuler
      window.rulers.nope;
    },
  });
});

test("multiple addRuler calls accumulate distinct keys", () => {
  const ctx = { currentTime: 0 };
  const timeline = new Timeline({ audioContext: ctx, bpm: 120 })
    .addRuler("bar", new LinearBarRuler({ numerator: 4, denominator: 4 }))
    .addRuler("bar2", new LinearBarRuler({ numerator: 3, denominator: 4 }));

  expectTypeOf(timeline.rulers.bar.current.value).toEqualTypeOf<LinearBarPoint>();
  expectTypeOf(timeline.rulers.bar2.current.value).toEqualTypeOf<LinearBarPoint>();
});
