import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only-shim.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Hosted Session Pooler has a 15-client cap. Each suite owns independent
    // repository pools; serialize files, preserving explicit concurrent cases.
    fileParallelism: false,
    maxWorkers: 1,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
