import { readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { M5ProviderEnvironmentCredentialResolver } from "@/application/intelligence/m5-provider-environment-credentials";
import { M5InProcessProviderRateLimitLease } from "@/application/intelligence/m5-provider-rate-limit-lease";
import { M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY } from "@/application/intelligence/m5-provider-live-smoke-authorization";
import { executeM5ProviderLiveSmoke, previewM5ProviderLiveSmoke } from "@/application/intelligence/m5-provider-live-smoke";
import { M5NodeProviderHttpTransport } from "@/infrastructure/intelligence/m5-node-provider-http-transport";

const USAGE = "Usage: npm run m5:provider:smoke -- --authorization <path> --provider <coingecko|etherscan> [--execute --environment LOCAL_SMOKE]";
type Args = Readonly<{ authorization?: string; provider?: string; execute: boolean; environment?: string; help: boolean }>;
const VALUE_FLAGS = new Set(["--authorization", "--provider", "--environment"]);

export function m5ProviderSmokeSupport(providerId: string) {
  if (providerId === "coingecko") return Object.freeze({ providerId, status: "SUPPORTED" as const, profile: "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_DEMO", requirement: "VALID_TRUSTED_SMOKE_AUTHORITY" });
  if (providerId === "etherscan") return Object.freeze({ providerId, status: "BLOCKED" as const, code: "M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT", executableSmoke: false });
  return Object.freeze({ providerId: "unknown", status: "UNSUPPORTED" as const });
}

export function isM5ProviderSmokeAuthorizationPath(path: string): boolean {
  const base = resolve("config/m5/provider-live-smoke");
  const target = resolve(path);
  const rel = relative(base, target);
  return Boolean(rel && rel !== "." && rel !== ".." && !rel.startsWith(`..${sep}`) && extname(target).toLowerCase() === ".json");
}

export function parseM5ProviderSmokeArgs(argv: readonly string[]): Args {
  const result: { authorization?: string; provider?: string; execute: boolean; environment?: string; help: boolean } = { execute: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!;
    if (flag === "--help" || flag === "-h") { if (result.help) throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID"); result.help = true; continue; }
    if (flag === "--execute") { if (result.execute) throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID"); result.execute = true; continue; }
    if (!VALUE_FLAGS.has(flag) || !argv[index + 1] || argv[index + 1]!.startsWith("--")) throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID");
    const value = argv[++index]!;
    if (flag === "--authorization") { if (result.authorization !== undefined) throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID"); result.authorization = value; }
    else if (flag === "--provider") { if (result.provider !== undefined || !["coingecko", "etherscan"].includes(value)) throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID"); result.provider = value; }
    else { if (result.environment !== undefined || value !== "LOCAL_SMOKE") throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID"); result.environment = value; }
  }
  if (result.help) return Object.freeze(result);
  if (!result.authorization || !result.provider || (result.execute && result.environment !== "LOCAL_SMOKE") || (!result.execute && result.environment !== undefined)) throw new Error("M5_PROVIDER_SMOKE_ARGUMENT_INVALID");
  return Object.freeze(result);
}
function strictConfig(value: unknown): { authorization: unknown; request: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 3 || keys.some(key => typeof key !== "string" || !["schemaVersion", "authorization", "request"].includes(key))) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  for (const key of keys as string[]) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID"); }
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== "m5-provider-live-smoke-cli-config/v1") throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  return { authorization: row.authorization, request: row.request };
}
async function readConfig(path: string): Promise<{ authorization: unknown; request: unknown }> {
  const target = resolve(path);
  if (!isM5ProviderSmokeAuthorizationPath(path)) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  const source = await readFile(target, "utf8");
  let parsed: unknown;
  try { parsed = JSON.parse(source.replace(/^\uFEFF/, "")) as unknown; } catch { throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID"); }
  return strictConfig(parsed);
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  let args: Args;
  try { args = parseM5ProviderSmokeArgs(argv); }
  catch { console.error(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_SMOKE_ARGUMENT_INVALID" })); process.exitCode = 2; return; }
  if (args.help) { console.log(USAGE); return; }
  if (args.provider === "etherscan") {
    console.log(JSON.stringify({ ...m5ProviderSmokeSupport("etherscan"), mode: args.execute ? "EXECUTE" : "DRY_RUN", supportedProfile: m5ProviderSmokeSupport("coingecko") }));
    process.exitCode = 2;
    return;
  }
  let loaded: { authorization: unknown; request: unknown };
  try { loaded = await readConfig(args.authorization!); }
  catch { console.error(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_SMOKE_CONFIG_INVALID" })); process.exitCode = 2; return; }
  if (!args.execute) {
    try {
      const plan = previewM5ProviderLiveSmoke({ config: loaded.request, authorization: loaded.authorization, providerId: args.provider! });
      console.log(JSON.stringify({ status: "PLAN", mode: "DRY_RUN", trustStatus: "UNRESOLVED", executableOnlyWithValidSmokeAuthority: true,
        supportedProfile: m5ProviderSmokeSupport("coingecko"), unsupportedProviders: [m5ProviderSmokeSupport("etherscan")], plan }));
    } catch { console.log(JSON.stringify({ status: "INVALID", mode: "DRY_RUN", code: "M5_PROVIDER_SMOKE_PLAN_INVALID" })); process.exitCode = 2; }
    return;
  }
  const asOf = new Date().toISOString();
  const result = await executeM5ProviderLiveSmoke({ config: loaded.request, authorization: loaded.authorization, providerId: args.provider!, environment: args.environment!, asOf,
    currentTime: () => new Date().toISOString(), trustedRegistry: M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY,
    credentials: new M5ProviderEnvironmentCredentialResolver(), transport: new M5NodeProviderHttpTransport(), rateLimit: new M5InProcessProviderRateLimitLease() });
  console.log(JSON.stringify(result));
  if (result.status === "BLOCKED" || result.status === "INVALID") process.exitCode = 2;
  else if (result.status === "INFRASTRUCTURE_FAILURE") process.exitCode = 3;
}

if (process.argv[1]?.endsWith("m5-provider-smoke.ts")) {
  main().catch(() => { console.error(JSON.stringify({ status: "INFRASTRUCTURE_FAILURE", code: "M5_PROVIDER_SMOKE_FAILURE" })); process.exitCode = 3; });
}
