import { createEngine } from "@audiorective/core";
import { createEngineContext } from "@audiorective/react";
import { StepSynth } from "./instruments/StepSynth";
import { KickSynth } from "./instruments/KickSynth";
import { SnareSynth } from "./instruments/SnareSynth";
import { HihatSynth } from "./instruments/HihatSynth";
import { MasterSequencer } from "./MasterSequencer";
import { TrackSequencer } from "./TrackSequencer";
import { DrumSequencer } from "./DrumSequencer";
import { PAD_NOTES, BASS_NOTES, noteToFreq, type Track } from "./trackConfig";

const SPATIAL_OPTS = { distanceModel: "inverse" as const, refDistance: 2, rolloffFactor: 1 };

export const engine = createEngine((ctx) => {
  const masterSeq = new MasterSequencer(ctx);

  const padSynth = new StepSynth(ctx);
  const padSeq = new TrackSequencer(padSynth, SPATIAL_OPTS, noteToFreq("C4"));
  masterSeq.register(
    (step, time) => padSeq.tick(step, time),
    () => padSeq.silence(),
  );

  const bassSynth = new StepSynth(ctx);
  const bassSeq = new TrackSequencer(bassSynth, SPATIAL_OPTS, noteToFreq("C2"));
  masterSeq.register(
    (step, time) => bassSeq.tick(step, time),
    () => bassSeq.silence(),
  );

  const kickSynth = new KickSynth(ctx);
  const kickSeq = new DrumSequencer(kickSynth, SPATIAL_OPTS);
  masterSeq.register(
    (step, time) => kickSeq.tick(step, time),
    () => kickSeq.silence(),
  );

  const snareSynth = new SnareSynth(ctx);
  const snareSeq = new DrumSequencer(snareSynth, SPATIAL_OPTS);
  masterSeq.register(
    (step, time) => snareSeq.tick(step, time),
    () => snareSeq.silence(),
  );

  const hihatSynth = new HihatSynth(ctx);
  const hihatSeq = new DrumSequencer(hihatSynth, SPATIAL_OPTS);
  masterSeq.register(
    (step, time) => hihatSeq.tick(step, time),
    () => hihatSeq.silence(),
  );

  const tracks: Track[] = [
    { id: "pad", label: "PAD", color: "#2563eb", seq: padSeq, instrument: { synth: padSynth, notes: PAD_NOTES } },
    { id: "bass", label: "BASS", color: "#7c3aed", seq: bassSeq, instrument: { synth: bassSynth, notes: BASS_NOTES } },
    { id: "kick", label: "KICK", color: "#dc2626", seq: kickSeq, instrument: { synth: kickSynth } },
    { id: "snare", label: "SNARE", color: "#d97706", seq: snareSeq, instrument: { synth: snareSynth } },
    { id: "hihat", label: "HIHAT", color: "#16a34a", seq: hihatSeq, instrument: { synth: hihatSynth } },
  ];

  return { masterSeq, tracks };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);
