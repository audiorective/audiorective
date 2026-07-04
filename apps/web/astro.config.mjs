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
            { label: "Overview", slug: "overview" },
            // "Get Started" entry omitted: slug 'get-started' doesn't exist until Task 1.3.
            // Re-add { label: "Get Started", slug: "get-started" } once that page is created.
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "Architecture", slug: "architecture" },
            { label: "Designing Audio Apps", slug: "designing-audio-apps" },
            { label: "Choosing Playback", slug: "choosing-playback" },
          ],
        },
        {
          label: "Packages",
          items: [
            { label: "Core", slug: "core" },
            { label: "React", slug: "react" },
            { label: "Three.js", slug: "threejs" },
            { label: "PlayCanvas", slug: "playcanvas" },
            { label: "PixiJS", slug: "pixijs" },
          ],
        },
      ],
    }),
    react(),
  ],
});
