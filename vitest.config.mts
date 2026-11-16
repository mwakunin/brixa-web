import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests for the logic that has rules, not for the framework: how money is
 * printed, what a refusal means, what "today" is in Nairobi. Plain functions,
 * no DOM and no API, so the suite runs in a second and gates every push.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Business dates are Nairobi's, and CI runs in UTC, where a wrong zone would pass unnoticed.
    env: { TZ: "Africa/Nairobi" },
  },
});
