import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { M5ProviderEnvironmentCredentialResolver } from "@/application/intelligence/m5-provider-environment-credentials";

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async entry => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  }));
  return children.flat();
}

describe("M5 smoke credential boundary", () => {
  it("resolves only a synthetic server environment value and keeps resolver imports out of app source", async () => {
    const sentinel = "SYNTHETIC_M5_SMOKE_SENTINEL_6A41F0";
    const resolverSource = await readFile(new URL("../../src/application/intelligence/m5-provider-environment-credentials.ts", import.meta.url), "utf8");
    expect(resolverSource).toContain('import "server-only"');
    expect(resolverSource).toContain('"COINGECKO_DEMO_API_KEY"');
    expect(resolverSource).not.toContain("NEXT_PUBLIC_");

    const appFiles = await sourceFiles(new URL("../../src/app/", import.meta.url));
    const appSources = await Promise.all(appFiles.map(path => readFile(path, "utf8")));
    expect(appSources.join("\n")).not.toMatch(/m5-provider-environment-credentials|M5ProviderEnvironmentCredentialResolver|COINGECKO_DEMO_API_KEY|m5-provider-live-smoke-registry/);

    vi.stubEnv("COINGECKO_DEMO_API_KEY", sentinel);
    try {
      const resolved = await new M5ProviderEnvironmentCredentialResolver().resolve({ kind: "API_KEY", reference: "env:coingecko-demo-api-key" });
      const sentinelAvailable = resolved.kind === "API_KEY" && resolved.value === sentinel;
      expect(sentinelAvailable).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
