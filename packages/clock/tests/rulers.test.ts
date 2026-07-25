import { describe, test, expect } from "vitest";
import { gridPoints } from "../src/rulers/Ruler";
import type { TimelineLike } from "../src/rulers/Ruler";
import { LinearBarRuler } from "../src/rulers/LinearBarRuler";
import { CycleBarRuler } from "../src/rulers/CycleBarRuler";
import { LinearTimeRuler } from "../src/rulers/LinearTimeRuler";
import { CycleTimeRuler } from "../src/rulers/CycleTimeRuler";
import type { CoreTickWindow } from "../src/types";

// beatToTime = beat / 2 for these tests: only the beat/index shape matters,
// `time` just has to trace back to timeline.beatToTime deterministically.
const identityTimeline: TimelineLike = {
  beatToTime: (beat) => beat / 2,
  timeToBeat: (time) => time * 2,
  position: 0,
};

function collect<T>(gen: Generator<T>): T[] {
  return Array.from(gen);
}

function makeWindow(startBeat: number, endBeat: number): CoreTickWindow {
  return {
    time: { started: 0, current: 0, lookAheadEnd: 0 },
    beat: { start: startBeat, end: endBeat },
    generation: 0,
    transport: { state: "playing", position: 0 },
  };
}

function makeTimeline(position = 0): TimelineLike {
  return {
    beatToTime: (beat) => beat / 2,
    timeToBeat: (time) => time * 2,
    position,
  };
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

describe("LinearBarRuler", () => {
  test("bar/beatInBar in 4/4", () => {
    const ruler = new LinearBarRuler({ numerator: 4, denominator: 4 }); // 4 beats/bar
    expect(ruler.at(0)).toMatchObject({ bar: 0, beatInBar: 0 });
    expect(ruler.at(3.5)).toMatchObject({ bar: 0, beatInBar: 3.5 });
    expect(ruler.at(4)).toMatchObject({ bar: 1, beatInBar: 0 });
    expect(ruler.at(10)).toMatchObject({ bar: 2, beatInBar: 2 });
  });

  test("bar/beatInBar in 6/8 (beatsPerBar = 6*4/8 = 3)", () => {
    const ruler = new LinearBarRuler({ numerator: 6, denominator: 8 });
    expect(ruler.at(0)).toMatchObject({ bar: 0, beatInBar: 0 });
    expect(ruler.at(2.9)).toMatchObject({ bar: 0, beatInBar: 2.9 });
    expect(ruler.at(3)).toMatchObject({ bar: 1, beatInBar: 0 });
    expect(ruler.at(7)).toMatchObject({ bar: 2, beatInBar: 1 });
  });

  test("grid across a bar boundary", () => {
    const ruler = new LinearBarRuler({ numerator: 4, denominator: 4 });
    const window = makeWindow(3, 5); // crosses the bar-1 boundary at beat 4
    const reading = ruler.read(window, identityTimeline);
    const points = collect(reading.grid(4)); // 16th notes: step = 4/4 = 1 beat
    expect(points.map((p) => p.beat)).toEqual([3, 4]);
  });

  test("statelessness: same beat queried twice gives an identical reading", () => {
    const ruler = new LinearBarRuler({ numerator: 4, denominator: 4 });
    expect(ruler.at(5)).toEqual(ruler.at(5));
  });

  test("read()'s point fields match at(window.beat.start)", () => {
    const ruler = new LinearBarRuler({ numerator: 4, denominator: 4 });
    const window = makeWindow(9, 10);
    const reading = ruler.read(window, identityTimeline);
    expect(reading).toMatchObject(ruler.at(9));
  });
});

describe("CycleBarRuler", () => {
  test("cycle/barInCycle/phase within a 4-bar (16-beat) region", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 }); // region = 16 beats
    expect(ruler.at(0)).toMatchObject({ cycle: 0, barInCycle: 0, beatInBar: 0, phase: 0 });
    expect(ruler.at(15)).toMatchObject({ cycle: 0, barInCycle: 3, beatInBar: 3 });
    expect(ruler.at(16)).toMatchObject({ cycle: 1, barInCycle: 0, beatInBar: 0, phase: 0 });
    expect(ruler.at(20)).toMatchObject({ cycle: 1, barInCycle: 1, beatInBar: 0 });
  });

  test("looping: the axis climbs monotonically, the reading wraps", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 }); // region = 16 beats
    expect(ruler.at(31).cycle).toBe(1);
    expect(ruler.at(31).barInCycle).toBe(3); // last bar of pass 1
    expect(ruler.at(32).cycle).toBe(2);
    expect(ruler.at(32).barInCycle).toBe(0); // wraps to bar 0 of a new pass, axis kept climbing
  });

  test("a region offset (from) shifts where the cycle starts", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4, from: 8 });
    expect(ruler.at(8)).toMatchObject({ cycle: 0, barInCycle: 0 });
    expect(ruler.at(24)).toMatchObject({ cycle: 1, barInCycle: 0 });
  });

  test("grid across the wrap emits both sides with strictly increasing time", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 }); // region = 16 beats
    const window = makeWindow(15, 17); // crosses the wrap at beat 16
    const reading = ruler.read(window, identityTimeline);
    const points = collect(reading.grid(16)); // 1 step per beat (16 steps/16-beat cycle)
    expect(points.map((p) => p.beat)).toEqual([15, 16]);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.time).toBeGreaterThan(points[i - 1]!.time);
    }
  });

  test("spans: a window inside one pass yields a single span", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 });
    const window = makeWindow(3, 5);
    const reading = ruler.read(window, identityTimeline);
    expect(reading.spans).toHaveLength(1);
    expect(reading.spans[0]).toMatchObject({ fromCycle: 3, toCycle: 5 });
  });

  test("spans: a window crossing the wrap yields two spans, each converting its own cyclePos range", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 }); // region = 16 beats
    const window = makeWindow(15, 17);
    const reading = ruler.read(window, identityTimeline);
    expect(reading.spans).toHaveLength(2);
    expect(reading.spans[0]).toMatchObject({ fromCycle: 15, toCycle: 16 });
    expect(reading.spans[1]).toMatchObject({ fromCycle: 0, toCycle: 1 });

    // span 0 covers cyclePos [15,16) of pass 0 (absolute beats [15,16))
    expect(reading.spans[0]!.toTime(15.5)).toBeCloseTo(identityTimeline.beatToTime(15.5));
    // span 1 covers cyclePos [0,1) of pass 1 (absolute beats [16,17))
    expect(reading.spans[1]!.toTime(0.5)).toBeCloseTo(identityTimeline.beatToTime(16.5));
  });

  test("spans: the same cycle-relative position converts to a different absolute time on each pass", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 }); // region = 16 beats
    const pass0 = ruler.read(makeWindow(3, 5), identityTimeline).spans[0]!;
    const pass1 = ruler.read(makeWindow(19, 21), identityTimeline).spans[0]!; // one full region later
    const cyclePos = 3; // same cycle-relative position in both passes
    expect(pass0.toTime(cyclePos)).toBeCloseTo(identityTimeline.beatToTime(3));
    expect(pass1.toTime(cyclePos)).toBeCloseTo(identityTimeline.beatToTime(19));
    expect(pass1.toTime(cyclePos)).toBeGreaterThan(pass0.toTime(cyclePos));
  });

  test("statelessness: same beat queried twice gives an identical reading", () => {
    const ruler = new CycleBarRuler({ numerator: 4, denominator: 4, bars: 4 });
    expect(ruler.at(20)).toEqual(ruler.at(20));
  });
});

describe("ruler option validation", () => {
  // A non-positive cycle length is not merely wrong, it hangs: _spans() walks
  // `cursor` by regionLength, so a negative length marches it away from the
  // window forever -- inside a tick callback, that freezes the tab. Reject at
  // construction, the way TempoCurve already rejects bpm <= 0.
  test("CycleBarRuler rejects a non-positive or non-finite bar count", () => {
    const opts = { numerator: 4, denominator: 4 };
    expect(() => new CycleBarRuler({ ...opts, bars: 0 })).toThrow(RangeError);
    expect(() => new CycleBarRuler({ ...opts, bars: -1 })).toThrow(RangeError);
    expect(() => new CycleBarRuler({ ...opts, bars: Infinity })).toThrow(RangeError);
    expect(() => new CycleBarRuler({ ...opts, bars: NaN })).toThrow(RangeError);
  });

  test("CycleTimeRuler rejects a non-positive or non-finite cycle length", () => {
    expect(() => new CycleTimeRuler({ seconds: 0 })).toThrow(RangeError);
    expect(() => new CycleTimeRuler({ seconds: -5 })).toThrow(RangeError);
    expect(() => new CycleTimeRuler({ seconds: NaN })).toThrow(RangeError);
  });

  test("bar rulers reject a degenerate time signature", () => {
    // beatsPerBar = numerator*4/denominator; 0/0 yields NaN, which makes
    // gridPoints' termination check (beat >= endBeat) never true.
    expect(() => new LinearBarRuler({ numerator: 0, denominator: 4 })).toThrow(RangeError);
    expect(() => new LinearBarRuler({ numerator: 4, denominator: 0 })).toThrow(RangeError);
    expect(() => new CycleBarRuler({ numerator: 4, denominator: 0, bars: 4 })).toThrow(RangeError);
  });

  test("valid options still construct", () => {
    expect(() => new LinearBarRuler({ numerator: 7, denominator: 8 })).not.toThrow();
    expect(() => new CycleBarRuler({ numerator: 4, denominator: 4, bars: 2, from: 8 })).not.toThrow();
    expect(() => new CycleTimeRuler({ seconds: 0.5 })).not.toThrow();
  });
});

describe("gridPoints — degenerate step guard", () => {
  test("a non-finite step yields nothing instead of looping forever", () => {
    // NaN fails every comparison, so the `beat >= endBeat` return could never
    // fire -- a hang in the scheduling hot path.
    expect(collect(gridPoints(0, 10, NaN, 0, identityTimeline))).toEqual([]);
    expect(collect(gridPoints(0, 10, Infinity, 0, identityTimeline))).toEqual([]);
  });

  test("a non-finite origin yields nothing", () => {
    expect(collect(gridPoints(0, 10, 1, NaN, identityTimeline))).toEqual([]);
  });
});

describe("LinearTimeRuler", () => {
  test("seconds mirrors timeline.position", () => {
    const ruler = new LinearTimeRuler();
    expect(ruler.at(0, makeTimeline(12.5))).toEqual({ seconds: 12.5 });
  });

  test("read() matches at()", () => {
    const ruler = new LinearTimeRuler();
    const timeline = makeTimeline(3);
    expect(ruler.read(makeWindow(0, 1), timeline)).toEqual(ruler.at(0, timeline));
  });
});

describe("CycleTimeRuler", () => {
  test("cycle/secondsInCycle/phase within a 10-second region", () => {
    const ruler = new CycleTimeRuler({ seconds: 10 });
    expect(ruler.at(0, makeTimeline(0))).toMatchObject({ cycle: 0, secondsInCycle: 0, phase: 0 });
    expect(ruler.at(0, makeTimeline(9))).toMatchObject({ cycle: 0, secondsInCycle: 9 });
    expect(ruler.at(0, makeTimeline(10))).toMatchObject({ cycle: 1, secondsInCycle: 0, phase: 0 });
    expect(ruler.at(0, makeTimeline(25))).toMatchObject({ cycle: 2, secondsInCycle: 5 });
  });

  test("a `from` offset shifts where the cycle starts", () => {
    const ruler = new CycleTimeRuler({ seconds: 10, from: 5 });
    expect(ruler.at(0, makeTimeline(5))).toMatchObject({ cycle: 0, secondsInCycle: 0 });
    expect(ruler.at(0, makeTimeline(15))).toMatchObject({ cycle: 1, secondsInCycle: 0 });
  });
});
