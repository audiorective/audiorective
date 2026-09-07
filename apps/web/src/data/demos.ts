export interface Demo {
  slug: string;
  title: string;
  blurb: string;
  thumb: string; // path under /public
  route: string; // internal route
  source: string; // GitHub URL
  packages: string[];
}

export const demos: Demo[] = [
  {
    slug: "livehouse",
    title: "Livehouse PA Simulator",
    blurb: "You're the PA tech in a cyber livehouse: six spatial audio drones in a PlayCanvas world, mixed from a React iPad HUD.",
    thumb: "/showroom/livehouse.jpg",
    route: "/showroom/livehouse",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/livehouse",
    packages: ["@audiorective/core", "@audiorective/react", "@audiorective/playcanvas", "three"],
  },
  {
    slug: "sequencer",
    title: "Step Sequencer",
    blurb:
      "A 4-track × 16-step drum machine routed through a lookahead limiter: one grid() loop schedules the pattern, defineGraph rewires live, PDC keeps the branches aligned, and the playhead lands with the ear.",
    thumb: "/showroom/sequencer.jpg",
    route: "/showroom/sequencer",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/sequencer",
    packages: ["@audiorective/clock", "@audiorective/core", "@audiorective/react"],
  },
  {
    slug: "pixi",
    title: "Pixi Spectrum Visualizer",
    blurb: "A minimal PixiJS spectrum visualizer built on only the core Analyser — no binding package required.",
    thumb: "/showroom/pixi.jpg",
    route: "/showroom/pixi",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/pixi",
    packages: ["@audiorective/core", "pixi.js"],
  },
  {
    slug: "fx-rack",
    title: "FX Rack",
    blurb:
      "Five inserts, two sends, a compressor and a limiter on one drum loop: every effect an AudioProcessor with a wet fader, PDC-aligned, and exportable offline.",
    thumb: "/showroom/fx-rack.jpg",
    route: "/showroom/fx-rack",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/fx-rack",
    packages: ["@audiorective/effects", "@audiorective/core", "@audiorective/react"],
  },
];
