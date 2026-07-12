import { describe, test, expect } from "vitest";
import { gridPoints } from "../src/rulers/Ruler";
import type { TimelineLike } from "../src/rulers/Ruler";

// beatToTime = beat / 2 for these tests: only the beat/index shape matters,
// `time` just has to trace back to timeline.beatToTime deterministically.
const identityTimeline: TimelineLike = {
  beatToTime: (beat) => beat / 2,
  timeToBeat: (time) => time * 2,
};

function collect<T>(gen: Generator<T>): T[] {
  return Array.from(gen);
}

describe("gridPoints — boundary exactness", () => {
  test("a grid point exactly at endBeat is excluded", () => {
    const points = collect(gridPoints(0, 4, 1, 0, identityTimeline));
    expect(points.map((p) => p.beat)).toEqual([0, 1, 2, 3]);
  });

  test("a grid point exactly at startBeat is included", () => {
    const points = collect(gridPoints(2, 6, 1, 0, identityTimeline));
    expect(points.map((p) => p.beat)).toEqual([2, 3, 4, 5]);
  });

  test("empty range when endBeat <= startBeat", () => {
    expect(collect(gridPoints(5, 5, 1, 0, identityTimeline))).toEqual([]);
    expect(collect(gridPoints(5, 2, 1, 0, identityTimeline))).toEqual([]);
  });

  test("empty when stepBeats is zero or negative", () => {
    expect(collect(gridPoints(0, 10, 0, 0, identityTimeline))).toEqual([]);
    expect(collect(gridPoints(0, 10, -1, 0, identityTimeline))).toEqual([]);
  });
});

describe("gridPoints — index and time", () => {
  test("index is position-derived (beat / step from origin), not a counter", () => {
    const points = collect(gridPoints(0, 4, 1, 0, identityTimeline));
    expect(points.map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });

  test("indices are stable at large beats", () => {
    const points = collect(gridPoints(1_000_000, 1_000_004, 1, 0, identityTimeline));
    expect(points.map((p) => p.beat)).toEqual([1_000_000, 1_000_001, 1_000_002, 1_000_003]);
    expect(points.map((p) => p.index)).toEqual([1_000_000, 1_000_001, 1_000_002, 1_000_003]);
  });

  test("time comes from timeline.beatToTime", () => {
    const points = collect(gridPoints(0, 2, 1, 0, identityTimeline));
    expect(points.map((p) => p.time)).toEqual([0, 0.5]);
  });

  test("a non-zero origin offsets the grid", () => {
    const points = collect(gridPoints(0, 4, 2, 1, identityTimeline)); // grid at 1,3,5...
    expect(points.map((p) => p.beat)).toEqual([1, 3]);
    expect(points.map((p) => p.index)).toEqual([0, 1]);
  });

  test("a window not aligned to the grid still yields only in-range points", () => {
    const points = collect(gridPoints(2.5, 5.5, 2, 0, identityTimeline)); // grid at 0,2,4,6...
    expect(points.map((p) => p.beat)).toEqual([4]);
  });
});
