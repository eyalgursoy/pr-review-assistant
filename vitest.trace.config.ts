/**
 * Vitest config for temp trace scripts only.
 * Run: npx vitest run -c vitest.trace.config.ts
 * Normal "npm test" uses the default config and does not run temp/.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["temp/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 30_000,
  },
});
