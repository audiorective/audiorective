// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";

export default defineConfig({
  output: "static",
  site: "https://audiorective.dev",
  integrations: [
    starlight({
      title: "Audiorective",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/audiorective/audiorective" }],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Overview", slug: "docs/overview" },
            { label: "Get Started", slug: "docs/get-started" },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Architecture", slug: "docs/architecture" },
            { label: "Designing Audio Apps", slug: "docs/designing-audio-apps" },
            { label: "Choosing Playback", slug: "docs/choosing-playback" },
          ],
        },
        {
          label: "Packages",
          items: [
            { label: "Core", slug: "docs/core" },
            { label: "React", slug: "docs/react" },
            { label: "Three.js", slug: "docs/threejs" },
            { label: "PlayCanvas", slug: "docs/playcanvas" },
            { label: "PixiJS", slug: "docs/pixijs" },
          ],
        },
      ],
    }),
    react(),
  ],
});
