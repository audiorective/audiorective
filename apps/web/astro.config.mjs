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
      // sidebar + content wiring added in Task 1.2
    }),
    react(),
  ],
});
