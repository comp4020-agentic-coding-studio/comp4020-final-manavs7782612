import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    // several checks wait on the live stream, each for up to a few seconds
    testTimeout: 20_000,
    globalSetup: ["./spec/global-setup.ts"],
  },
});
