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
    include: ["tests/financial/**/*.test.ts", "tests/diagnostics/**/*.test.ts", "tests/integration/m5-suspicious-coverage-authority.test.ts", "tests/integration/m5-suspicious-coverage-schema-invariants.test.ts"],
  },
});
