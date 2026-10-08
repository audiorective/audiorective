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
    blurb: "Move sound sources in a 3D venue. Mix the same engine through PlayCanvas, React, and Three.js interfaces.",
    thumb: "/showroom/livehouse.jpg",
    route: "/showroom/livehouse",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/livehouse",
    packages: ["@audiorective/core", "@audiorective/react", "@audiorective/playcanvas", "three"],
  },
  {
    slug: "sequencer",
    title: "Step Sequencer",
    blurb: "Edit a four-track beat and change tempo live. A latency lab shows how parallel paths stay aligned.",
    thumb: "/showroom/sequencer.jpg",
    route: "/showroom/sequencer",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/sequencer",
    packages: ["@audiorective/clock", "@audiorective/core", "@audiorective/react"],
  },
  {
    slug: "pixi",
    title: "Pixi Spectrum Visualizer",
    blurb: "Shape a drone with a canvas control and watch its spectrum. Uses core directly with PixiJS.",
    thumb: "/showroom/pixi.jpg",
    route: "/showroom/pixi",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/pixi",
    packages: ["@audiorective/core", "pixi.js"],
  },
  {
    slug: "fx-rack",
    title: "FX Rack",
    blurb: "Process a drum loop with inserts, sends, and dynamics. Render the result offline and export a WAV.",
    thumb: "/showroom/fx-rack.jpg",
    route: "/showroom/fx-rack",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/fx-rack",
    packages: ["@audiorective/effects", "@audiorective/core", "@audiorective/react"],
  },
];
