import { renderOffline } from "@audiorective/core";
import type { PitchShiftEngine } from "@audiorective/effects";
import { createDrumKit } from "../../sequencer/audio/drumKit";
import { FxRack, type InsertKey, type SendKey } from "./FxRack";
import { encodeWav } from "./wavEncode";

export interface RackSettings {
  engine: PitchShiftEngine;
  pitch: number;
  inserts: Record<InsertKey, { wet: number; value: number }>;
  sends: Record<SendKey, number>;
  compressor: { threshold: number; ratio: number };
  limiter: { threshold: number };
}

const insertValue = {
  pitchShift: (r: FxRack) => r.inserts.pitchShift.params.pitch,
  filter: (r: FxRack) => r.inserts.filter.params.frequency,
  frequencyShifter: (r: FxRack) => r.inserts.frequencyShifter.params.frequency,
  distortion: (r: FxRack) => r.inserts.distortion.params.distortion,
  phaser: (r: FxRack) => r.inserts.phaser.params.octaves,
} as const;

export function readSettings(rack: FxRack): RackSettings {
  const inserts = Object.fromEntries(
    (Object.keys(insertValue) as InsertKey[]).map((k) => [k, { wet: rack.inserts[k].params.wet.value, value: insertValue[k](rack).value }]),
  ) as RackSettings["inserts"];
  return {
    engine: rack.inserts.pitchShift.engine,
    pitch: rack.inserts.pitchShift.params.pitch.value,
    inserts,
    sends: { delay: rack.sends.delay.send.gain.value, reverb: rack.sends.reverb.send.gain.value },
    compressor: { threshold: rack.compressor.params.threshold.value, ratio: rack.compressor.params.ratio.value },
    limiter: { threshold: rack.limiter.params.threshold.value },
  };
}

export function applySettings(rack: FxRack, s: RackSettings): void {
  for (const k of Object.keys(insertValue) as InsertKey[]) {
    rack.inserts[k].params.wet.value = s.inserts[k].wet;
    insertValue[k](rack).value = s.inserts[k].value;
  }
  rack.sends.delay.send.gain.value = s.sends.delay;
  rack.sends.reverb.send.gain.value = s.sends.reverb;
  rack.compressor.params.threshold.value = s.compressor.threshold;
  rack.compressor.params.ratio.value = s.compressor.ratio;
  rack.limiter.params.threshold.value = s.limiter.threshold;
}

/** Renders `bars` of the pad pattern through a fresh FxRack with the live rack's settings. */
export async function exportBars(bars: number, bpm: number, settings: RackSettings, loop: AudioBuffer | null): Promise<Blob> {
  const seconds = (bars * 4 * 60) / bpm + 1;
  const buffer = await renderOffline({ seconds }, async (ctx) => {
    const rack = new FxRack(ctx, { kit: createDrumKit(ctx), loop, pitchEngine: settings.engine });
    rack.output.connect(ctx.destination);
    await rack.ready;
    applySettings(rack, settings);
    if (loop) rack.play(0);
    rack.scheduleBars(bars, bpm, 0);
  });
  return encodeWav(buffer);
}
