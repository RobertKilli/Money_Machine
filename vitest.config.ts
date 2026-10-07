import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { secRuntimePrivateLoader } from "./tests/helpers/sec-runtime-private-loader";
import { coinbaseNodePrivateLoader } from "./tests/helpers/coinbase-node-private-loader";

export default defineConfig({
  plugins:[secRuntimePrivateLoader(), coinbaseNodePrivateLoader()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only-shim.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/financial/**/*.test.ts", "tests/financial/sec-observation-admin-panel.test.tsx", "tests/diagnostics/**/*.test.ts", "tests/integration/m5-suspicious-coverage-authority.test.ts", "tests/integration/m5-suspicious-coverage-schema-invariants.test.ts"],
  },
});
