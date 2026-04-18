import { createEngine, Spatial } from "@audiorective/core";
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

  const spatialOpts = { distanceModel: "inverse" as const, refDistance: 2, rolloffFactor: 1 };
  const wire = (synth: { output?: AudioNode }): Spatial => {
    const spatial = new Spatial(ctx, spatialOpts);
    synth.output?.connect(spatial.input);
    spatial.output.connect(ctx.destination);
    return spatial;
  };

  const padSynth = new StepSynth(ctx);
  const padSpatial = wire(padSynth);
  const padSeq = new TrackSequencer(padSynth, noteToFreq("C4"));
  masterSeq.register(
    (step, time) => padSeq.tick(step, time),
    () => padSeq.silence(),
  );

  const bassSynth = new StepSynth(ctx);
  const bassSpatial = wire(bassSynth);
  const bassSeq = new TrackSequencer(bassSynth, noteToFreq("C2"));
  masterSeq.register(
    (step, time) => bassSeq.tick(step, time),
    () => bassSeq.silence(),
  );

  const kickSynth = new KickSynth(ctx);
  const kickSpatial = wire(kickSynth);
  const kickSeq = new DrumSequencer(kickSynth);
  masterSeq.register(
    (step, time) => kickSeq.tick(step, time),
    () => kickSeq.silence(),
  );

  const snareSynth = new SnareSynth(ctx);
  const snareSpatial = wire(snareSynth);
  const snareSeq = new DrumSequencer(snareSynth);
  masterSeq.register(
    (step, time) => snareSeq.tick(step, time),
    () => snareSeq.silence(),
  );

  const hihatSynth = new HihatSynth(ctx);
  const hihatSpatial = wire(hihatSynth);
  const hihatSeq = new DrumSequencer(hihatSynth);
  masterSeq.register(
    (step, time) => hihatSeq.tick(step, time),
    () => hihatSeq.silence(),
  );

  const tracks: Track[] = [
    { id: "pad", label: "PAD", color: "#2563eb", seq: padSeq, spatial: padSpatial, instrument: { synth: padSynth, notes: PAD_NOTES } },
    { id: "bass", label: "BASS", color: "#7c3aed", seq: bassSeq, spatial: bassSpatial, instrument: { synth: bassSynth, notes: BASS_NOTES } },
    { id: "kick", label: "KICK", color: "#dc2626", seq: kickSeq, spatial: kickSpatial, instrument: { synth: kickSynth } },
    { id: "snare", label: "SNARE", color: "#d97706", seq: snareSeq, spatial: snareSpatial, instrument: { synth: snareSynth } },
    { id: "hihat", label: "HIHAT", color: "#16a34a", seq: hihatSeq, spatial: hihatSpatial, instrument: { synth: hihatSynth } },
  ];

  return { masterSeq, tracks };
});

export const { EngineProvider, useEngine } = createEngineContext(engine);
