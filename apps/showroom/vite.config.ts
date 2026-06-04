import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  appType: "mpa",
  build: {
    rollupOptions: {
      input: {
        picker: resolve(__dirname, "index.html"),
        sequencer: resolve(__dirname, "sequencer/index.html"),
        spatialRoom: resolve(__dirname, "spatial-room/index.html"),
        spatialRoomPlayCanvas: resolve(__dirname, "spatial-room-playcanvas/index.html"),
      },
    },
  },
});
