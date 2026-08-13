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
          // sandbox pre-installs a browser revision older than what this
          // pinned playwright version expects to download; point at it directly
          executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH ? `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` : undefined,
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
