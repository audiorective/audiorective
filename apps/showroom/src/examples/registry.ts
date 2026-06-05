export interface ExampleEntry {
  id: string;
  title: string;
  description: string;
  path: string;
  tags?: readonly string[];
}

export const examples: readonly ExampleEntry[] = [
  {
    id: "sequencer",
    title: "Step Sequencer",
    description:
      "Five-track step sequencer with spatial panning. Drum kit + lead/bass synths driven by a master clock; spatial scene observes the same engine state as the React UI.",
    path: "/sequencer/",
    tags: ["sequencer", "synths", "spatial", "console-api"],
  },
  {
    id: "spatial-room",
    title: "Spatial Music Room",
    description:
      "First-person 3D room with a CD player and a speaker. Click the CD player for transport + 3-band EQ; the speaker is a positional audio source — turn the camera to hear the panning shift.",
    path: "/spatial-room/",
    tags: ["three.js", "spatial", "music-player", "EQ"],
  },
  {
    id: "spatial-room-playcanvas",
    title: "Spatial Music Room (PlayCanvas)",
    description:
      "Same room, same shared audio engine, bound to PlayCanvas via the anchor model. audiorective owns the whole graph (source → EQ → spatial panner); bindPanner from @audiorective/playcanvas drives the panner from the speaker entity's transform, and the camera's AudioListenerComponent drives the listener — mirroring the three.js demo.",
    path: "/spatial-room-playcanvas/",
    tags: ["playcanvas", "spatial", "anchor", "music-player", "EQ"],
  },
] as const;
