import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    // Audio tests assert against the AudioContext wall-clock; running test files in
    // parallel browser contexts starves those timers and makes them flaky. Serialize.
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
