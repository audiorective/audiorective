import { useEffect, useRef, useState } from "react";
import { useValue } from "@audiorective/react";
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

export function FlashRow() {
  const { core, beat, click } = useEngine();
  const hits = useValue(beat.hits);
  const ticks = useValue(click.ticks);
  const [flashing, setFlashing] = useState<Record<PadId, boolean>>({ kick: false, snare: false, hat: false, click: false });
  // Every hit time already scheduled, so re-renders (or a shorter ring buffer
  // wrap) never schedule the same flash twice.
  const scheduledRef = useRef(new Set<string>());

  function flash(pad: PadId) {
    setFlashing((prev) => ({ ...prev, [pad]: true }));
    setTimeout(() => setFlashing((prev) => ({ ...prev, [pad]: false })), FLASH_MS);
  }

  useEffect(() => {
    const ctx = core.context;
    // The graph solves once at construction, before any hit is ever recorded, so
    // this always resolves in practice; the guard is only against a hit landing
    // between a dispose() (PDC/bypass toggle) and the rebuilt graph's own solve.
    let pathLatency: number;
    try {
      pathLatency = core.getPathLatency(beat);
    } catch {
      return;
    }
    for (const hit of hits) {
      const key = `beat:${hit.voice}:${hit.time}`;
      if (scheduledRef.current.has(key)) continue;
      scheduledRef.current.add(key);
      const delay = flashDelayMs(hit.time, pathLatency, ctx.sampleRate, ctx.outputLatency ?? 0, ctx.currentTime);
      setTimeout(() => flash(hit.voice), delay);
    }
  }, [hits, core, beat]);

  useEffect(() => {
    const ctx = core.context;
    let pathLatency: number;
    try {
      pathLatency = core.getPathLatency(click);
    } catch {
      return;
    }
    for (const time of ticks) {
      const key = `click:${time}`;
      if (scheduledRef.current.has(key)) continue;
      scheduledRef.current.add(key);
      const delay = flashDelayMs(time, pathLatency, ctx.sampleRate, ctx.outputLatency ?? 0, ctx.currentTime);
      setTimeout(() => flash("click"), delay);
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
