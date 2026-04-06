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

export const engine = createEngine((ctx) => {
  const masterSeq = new MasterSequencer(ctx);

  // Pad synth track (C3–C5 range)
  const padSynth = new StepSynth(ctx);
  padSynth.output.connect(ctx.destination);
  const padSeq = new TrackSequencer(padSynth, noteToFreq("C4"));
  masterSeq.register(
    (step, time) => padSeq.tick(step, time),
    () => padSeq.silence(),
  );

  // Bass synth track (C1–C3 range)
  const bassSynth = new StepSynth(ctx);
  bassSynth.output.connect(ctx.destination);
  const bassSeq = new TrackSequencer(bassSynth, noteToFreq("C2"));
  masterSeq.register(
    (step, time) => bassSeq.tick(step, time),
    () => bassSeq.silence(),
  );

  // Kick drum
  const kickSynth = new KickSynth(ctx);
  kickSynth.output.connect(ctx.destination);
  const kickSeq = new DrumSequencer(kickSynth);
  masterSeq.register(
    (step, time) => kickSeq.tick(step, time),
    () => kickSeq.silence(),
  );

  // Snare drum
  const snareSynth = new SnareSynth(ctx);
  snareSynth.output.connect(ctx.destination);
  const snareSeq = new DrumSequencer(snareSynth);
  masterSeq.register(
    (step, time) => snareSeq.tick(step, time),
    () => snareSeq.silence(),
  );

  // Hihat
  const hihatSynth = new HihatSynth(ctx);
  hihatSynth.output.connect(ctx.destination);
  const hihatSeq = new DrumSequencer(hihatSynth);
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
