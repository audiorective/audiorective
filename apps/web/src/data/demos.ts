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
    slug: "pixi",
    title: "Pixi Spectrum Visualizer",
    blurb: "A minimal PixiJS spectrum visualizer built on only the core Analyser — no binding package required.",
    thumb: "/showroom/pixi.jpg",
    route: "/showroom/pixi",
    source: "https://github.com/audiorective/audiorective/tree/main/apps/web/src/demos/pixi",
    packages: ["@audiorective/core", "pixi.js"],
  },
];
