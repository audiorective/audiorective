import { useEffect, useRef, useState } from "react";
import { useValue } from "@audiorective/react";
import type { AudioEngine, AudioProcessor } from "@audiorective/core";
import { useEngine } from "../audio/engine";
import { flashDelayMs } from "../audio/flashTime";

type PadId = "kick" | "snare" | "hat" | "click";

const PAD_LABEL: Record<PadId, string> = {
  kick: "Kick",
  snare: "Snare",
  hat: "Hat",
  click: "Click",
};

const FLASH_MS = 60;

// `core.getPathLatency` throws if `proc` hasn't joined a solve yet — practically only
// in the gap between a graph `dispose()` (a PDC/bypass toggle) and its rebuild's first
// solve. Warns once per source rather than on every failing hit, so a real regression
// is still visible without spamming the console while that gap is open.
function resolvePathLatency(core: AudioEngine, proc: AudioProcessor, label: string, warned: Set<string>): number | null {
  try {
    return core.getPathLatency(proc);
  } catch (err) {
    if (!warned.has(label)) {
      warned.add(label);
      console.warn(`FlashRow: path latency for "${label}" is unavailable — its hits won't flash until the graph re-solves`, err);
    }
    return null;
  }
}

export function FlashRow() {
  const { core, beat, click } = useEngine();
  const hits = useValue(beat.hits);
  const ticks = useValue(click.ticks);
  const [flashing, setFlashing] = useState<Record<PadId, boolean>>({ kick: false, snare: false, hat: false, click: false });
  // Every hit time already scheduled, so re-renders never schedule the same flash
  // twice; pruned each effect run against the current (bounded ring) hits/ticks so
  // it never grows past what's live.
  const scheduledRef = useRef(new Set<string>());
  // Every live setTimeout, trigger and off-flash alike — cleared on unmount so a
  // flash never fires (or `setFlashing` never runs) after the component is gone.
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const warnedRef = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const id of timersRef.current) clearTimeout(id);
      timersRef.current.clear();
    },
    [],
  );

  function schedule(fn: () => void, delay: number): void {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, delay);
    timersRef.current.add(id);
  }

  function flash(pad: PadId) {
    setFlashing((prev) => ({ ...prev, [pad]: true }));
    schedule(() => setFlashing((prev) => ({ ...prev, [pad]: false })), FLASH_MS);
  }

  useEffect(() => {
    const ctx = core.context;
    const live = new Set(hits.map((hit) => `beat:${hit.voice}:${hit.time}`));
    for (const key of scheduledRef.current) {
      if (key.startsWith("beat:") && !live.has(key)) scheduledRef.current.delete(key);
    }

    const pathLatency = resolvePathLatency(core, beat, "beat", warnedRef.current);
    for (const hit of hits) {
      const key = `beat:${hit.voice}:${hit.time}`;
      if (scheduledRef.current.has(key)) continue;
      // Marked scheduled either way — a hit whose latency failed to resolve this
      // render must not be replayed on a later render with a stale delay.
      scheduledRef.current.add(key);
      if (pathLatency === null) continue;
      const delay = flashDelayMs(hit.time, pathLatency, ctx.sampleRate, ctx.outputLatency ?? 0, ctx.currentTime);
      schedule(() => flash(hit.voice), delay);
    }
  }, [hits, core, beat]);

  useEffect(() => {
    const ctx = core.context;
    const live = new Set(ticks.map((time) => `click:${time}`));
    for (const key of scheduledRef.current) {
      if (key.startsWith("click:") && !live.has(key)) scheduledRef.current.delete(key);
    }

    const pathLatency = resolvePathLatency(core, click, "click", warnedRef.current);
    for (const time of ticks) {
      const key = `click:${time}`;
      if (scheduledRef.current.has(key)) continue;
      scheduledRef.current.add(key);
      if (pathLatency === null) continue;
      const delay = flashDelayMs(time, pathLatency, ctx.sampleRate, ctx.outputLatency ?? 0, ctx.currentTime);
      schedule(() => flash("click"), delay);
    }
  }, [ticks, core, click]);

  const pads: PadId[] = ["kick", "snare", "hat", "click"];

  return (
    <div className="flash-row">
      {pads.map((pad) => (
        <div key={pad} className={`flash-pad${flashing[pad] ? " flash-pad--on" : ""}`}>
          {PAD_LABEL[pad]}
        </div>
      ))}
    </div>
  );
}
