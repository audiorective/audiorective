interface TempoEvent {
  time: number;
  value: number;
}

function assertValidBpm(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`bpm must be a finite number > 0, got ${value}`);
  }
}

/**
 * Sorted step-event list mapping audio-clock seconds -> bpm, with the
 * integrals needed to convert between seconds and beats. Pure: no time
 * source, no signals. V1 events are steps only (no ramps).
 */
export class TempoCurve {
  private _events: TempoEvent[];

  constructor(initialBpm: number) {
    assertValidBpm(initialBpm);
    this._events = [{ time: 0, value: initialBpm }];
  }

  /** Index of the last event with event.time <= time (always >= 0). */
  private _indexAtOrBefore(time: number): number {
    let lo = 0;
    let hi = this._events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this._events[mid]!.time <= time) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  setValueAtTime(value: number, time: number): void {
    assertValidBpm(value);
    const events = this._events;
    const idx = this._indexAtOrBefore(time);
    if (events[idx]!.time === time) {
      events[idx] = { time, value };
      return;
    }
    events.splice(idx + 1, 0, { time, value });
  }

  cancelScheduledValues(time: number): void {
    const events = this._events;
    let idx = events.findIndex((e) => e.time >= time);
    if (idx === -1) return; // every event is before `time` -- nothing to cancel
    // the first event anchors the curve's initial value; never drop it, so
    // the curve can never end up with nothing left for valueAt to read
    if (idx === 0) idx = 1;
    events.length = idx;
  }

  cancelAndHoldAtTime(time: number): void {
    const heldValue = this.valueAt(time);
    this.cancelScheduledValues(time);
    this.setValueAtTime(heldValue, time);
  }

  valueAt(time: number): number {
    return this._events[this._indexAtOrBefore(time)]!.value;
  }

  /** Beats elapsed between t0 and t1 (t1 >= t0), integrating bpm/60 per segment. */
  beatsBetween(t0: number, t1: number): number {
    if (t1 <= t0) return 0;
    const events = this._events;
    let idx = this._indexAtOrBefore(t0);
    let cursor = t0;
    let beats = 0;
    while (cursor < t1) {
      const segEnd = idx + 1 < events.length ? Math.min(events[idx + 1]!.time, t1) : t1;
      beats += ((segEnd - cursor) * events[idx]!.value) / 60;
      cursor = segEnd;
      idx++;
    }
    return beats;
  }

  /**
   * Inverse of beatsBetween: seconds needed to advance deltaBeats starting
   * at fromTime. Walks segments consuming beats until deltaBeats is spent.
   */
  timeToAdvance(fromTime: number, deltaBeats: number): number {
    if (deltaBeats <= 0) return 0;
    const events = this._events;
    let idx = this._indexAtOrBefore(fromTime);
    let cursor = fromTime;
    let remaining = deltaBeats;
    for (;;) {
      const segEndTime = idx + 1 < events.length ? events[idx + 1]!.time : Infinity;
      const segDuration = segEndTime - cursor;
      const bpm = events[idx]!.value;
      const segBeats = segDuration === Infinity ? Infinity : (segDuration * bpm) / 60;
      if (segBeats >= remaining) {
        return cursor + (remaining * 60) / bpm - fromTime;
      }
      remaining -= segBeats;
      cursor = segEndTime;
      idx++;
    }
  }
}
