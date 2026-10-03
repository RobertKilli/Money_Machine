import type { Plugin } from "vite";

/** Compiler-only primitive injection. Next.js and CLI never configure this plugin. */
export function coinbaseNodePrivateLoader(): Plugin {
  return {
    name: "coinbase-node-private-test-access",
    enforce: "pre",
    resolveId(id) { if (id === "test-only:coinbase-node-transport") return "\0coinbase-node-private-access"; },
    load(id) { if (id === "\0coinbase-node-private-access") return 'export { runCoinbaseNodeSmokeForTest as runFakeSmoke, validateAddressSetForTest as validateAddresses, createLocalRateLeaseForTest as createRateLease } from "@/infrastructure/intelligence/m5-coinbase-node-smoke-transport";'; },
    transform(code, id) {
      if (id.replaceAll("\\", "/").endsWith("/src/infrastructure/intelligence/m5-coinbase-node-smoke-transport.ts")) return `${code}\nexport { runCoinbaseNodeSmoke as runCoinbaseNodeSmokeForTest, validateAddressSet as validateAddressSetForTest, createLocalRateLease as createLocalRateLeaseForTest };\n`;
    },
  };
}
