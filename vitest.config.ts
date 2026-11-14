import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/helpers/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Route tests import large module graphs on demand. The 5s default is too tight for a loaded or
    // self-hosted CI runner (the suite runs ~10x slower there); a genuine hang still fails, just later.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
