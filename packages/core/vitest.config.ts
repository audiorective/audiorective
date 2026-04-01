import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
