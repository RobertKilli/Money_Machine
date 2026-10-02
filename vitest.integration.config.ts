import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { defineConfig } from "vitest/config";
import { transformWithOxc } from "vite";
import { secRuntimePrivateLoader } from "./tests/helpers/sec-runtime-private-loader";

export default defineConfig({
  // Test-only access to the production UoW's private persistence operation.
  // This loader is absent from application builds; it creates no trusted input.
  plugins: [secRuntimePrivateLoader(),{
    name: "sec-artifact-private-integration-access",
    enforce: "pre",
    resolveId(id) {
      if (id === "test-only:sec-artifact-uow") return "\0sec-artifact-private-integration.ts";
    },
    async load(id) {
      if (id !== "\0sec-artifact-private-integration.ts") return;
      const source = await readFile(new URL("./src/infrastructure/postgres/sec-edgar-event-source-provenance-uow.ts", import.meta.url), "utf8");
      return transformWithOxc(`${source}\nexport { persistDocumentArtifact };\n`, "sec-artifact-private-integration.ts", { lang: "ts" });
    },
  }],
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
