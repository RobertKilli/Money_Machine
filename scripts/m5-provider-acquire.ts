import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bindM5ProviderReadinessAggregateSource, evaluateM5ProviderReadinessAggregate } from "@/application/intelligence/evaluate-m5-provider-readiness-aggregate";
import { evaluateM5ProviderReadinessConfig } from "@/application/intelligence/evaluate-m5-provider-readiness";
import { M5ProviderEnvironmentCredentialResolver } from "@/application/intelligence/m5-provider-environment-credentials";
import { M5InProcessProviderRateLimitLease } from "@/application/intelligence/m5-provider-rate-limit-lease";
import { executeM5ProviderLiveAcquisition, planM5ProviderLiveAcquisition, type M5ProviderLiveAcquisitionRequest } from "@/application/intelligence/m5-provider-live-acquisition";
import { M5NodeProviderHttpTransport } from "@/infrastructure/intelligence/m5-node-provider-http-transport";
import type { ProviderDatasetReadiness } from "@/domain/intelligence/m5-provider-readiness";
import { parseM5ProviderReadinessAggregateConfig } from "@/domain/intelligence/m5-provider-readiness-aggregate";

const AGGREGATE_CONFIG = "config/m5/provider-readiness.aggregate.production.json";
const PROVIDER_CONFIG = "config/m5/provider-readiness.production.json";
const usage = "Usage: m5:provider:acquire --config <path> --provider <coingecko|etherscan> [--coin-id <id> --contract-address <0x...> --from <ISO> --to <ISO>] [--execute]";
type Args = { help: boolean; execute: boolean; config?: string; provider?: string; coinId?: string; contractAddress?: string; from?: string; to?: string };
const valueArgs = new Set(["--config", "--provider", "--coin-id", "--contract-address", "--from", "--to"]);

export function isProductionM5ProviderReadinessConfigPath(path: string): boolean {
  return resolve(path) === resolve(PROVIDER_CONFIG);
}

export function parseM5ProviderAcquireArgs(argv: readonly string[]): Args {
  const result: Args = { help: false, execute: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") { if (result.help) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.help = true; continue; }
    if (arg === "--execute") { if (result.execute) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.execute = true; continue; }
    if (!valueArgs.has(arg) || !argv[i + 1] || argv[i + 1]!.startsWith("--")) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID");
    const value = argv[++i]!;
    if (arg === "--config") { if (result.config !== undefined) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.config = value; }
    else if (arg === "--provider") { if (result.provider !== undefined) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.provider = value; }
    else if (arg === "--coin-id") { if (result.coinId !== undefined) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.coinId = value; }
    else if (arg === "--contract-address") { if (result.contractAddress !== undefined) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.contractAddress = value; }
    else if (arg === "--from") { if (result.from !== undefined) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.from = value; }
    else if (arg === "--to") { if (result.to !== undefined) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID"); result.to = value; }
  }
  if (result.help) return result;
  if (!result.config || (result.provider !== "coingecko" && result.provider !== "etherscan") || !result.contractAddress) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID");
  if (result.provider === "coingecko" && (!result.coinId || !result.from || !result.to)) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID");
  if (result.provider === "etherscan" && (result.coinId !== undefined || result.from !== undefined || result.to !== undefined)) throw new Error("M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID");
  return result;
}

function requestFrom(args: Args, readiness: ProviderDatasetReadiness): M5ProviderLiveAcquisitionRequest {
  if (args.provider === "coingecko") return { providerId: "coingecko", coinId: args.coinId!, contractAddress: args.contractAddress!, from: args.from!, to: args.to!, datasetVersion: readiness.datasetVersion };
  return { providerId: "etherscan", contractAddress: args.contractAddress!, datasetVersion: readiness.datasetVersion };
}
async function jsonFile(path: string): Promise<unknown> {
  const text = await readFile(resolve(path), "utf8");
  try { return JSON.parse(text.replace(/^\uFEFF/, "")) as unknown; } catch { throw new Error("M5_PROVIDER_ACQUIRE_CONFIG_INVALID"); }
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  let args: Args;
  try { args = parseM5ProviderAcquireArgs(argv); }
  catch (error) { console.error(JSON.stringify({ status: "INVALID", code: error instanceof Error ? error.message : "M5_PROVIDER_ACQUIRE_ARGUMENT_INVALID" })); process.exitCode = 2; return; }
  if (args.help) { console.log(usage); return; }
  if (!isProductionM5ProviderReadinessConfigPath(args.config!)) { console.error(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_ACQUIRE_CONFIG_SCOPE_INVALID" })); process.exitCode = 2; return; }
  let rawConfig: unknown; let aggregateRaw: unknown;
  try { [rawConfig, aggregateRaw] = await Promise.all([jsonFile(args.config!), jsonFile(AGGREGATE_CONFIG)]); }
  catch { console.error(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_ACQUIRE_CONFIG_IO_FAILED" })); process.exitCode = 2; return; }
  const asOf = new Date().toISOString();
  const readiness = evaluateM5ProviderReadinessConfig({ config: rawConfig, evaluatedAt: asOf });
  if (readiness.result === "INVALID" || readiness.providerId !== args.provider) {
    console.log(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_ACQUIRE_CONFIG_SCOPE_INVALID" })); process.exitCode = 2; return;
  }
  const request = requestFrom(args, rawConfig as ProviderDatasetReadiness);
  let plan: ReturnType<typeof planM5ProviderLiveAcquisition>;
  try { plan = planM5ProviderLiveAcquisition({ request }); }
  catch { console.log(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_ACQUIRE_PLAN_INVALID" })); process.exitCode = 2; return; }
  let aggregate;
  try {
    const aggregateConfig = parseM5ProviderReadinessAggregateConfig(aggregateRaw);
    const expectedSource = aggregateConfig.sources.find(source => source.providerId === readiness.providerId && source.datasetId === readiness.datasetId && source.datasetVersion === readiness.datasetVersion);
    const sourceId = expectedSource?.sourceId ?? "m5-provider-source:missing";
    const bound = bindM5ProviderReadinessAggregateSource(rawConfig, readiness);
    aggregate = evaluateM5ProviderReadinessAggregate({ config: aggregateConfig, sources: [{ sourceId, config: rawConfig, evaluation: readiness }], evaluatedAt: asOf });
    if (bound.sourceId !== sourceId) throw new Error("M5_PROVIDER_ACQUIRE_SOURCE_SCOPE_INVALID");
  } catch {
    console.log(JSON.stringify({ status: "INVALID", code: "M5_PROVIDER_ACQUIRE_AGGREGATE_INVALID", plan })); process.exitCode = 2; return;
  }
  if (!args.execute) {
    console.log(JSON.stringify({ status: aggregate.result === "READY" ? "READY" : "BLOCKED", mode: "DRY_RUN", asOf, plan, aggregateResult: aggregate.result, blockers: [...aggregate.blockers] }));
    if (aggregate.result !== "READY") process.exitCode = 2;
    return;
  }
  // The production aggregate uses the immutable, empty authority registry. A blocked result exits
  // here before constructing either the credential resolver or HTTP transport.
  if (aggregate.result !== "READY") {
    console.log(JSON.stringify({ status: "BLOCKED", mode: "EXECUTE", asOf, plan, aggregateResult: aggregate.result, blockers: [...aggregate.blockers] }));
    process.exitCode = 2; return;
  }
  const result = await executeM5ProviderLiveAcquisition({ aggregate, readiness, request, asOf, currentTime: () => new Date().toISOString(),
    credential: { kind: "API_KEY", reference: args.provider === "coingecko" ? "env:coingecko-pro-api-key" : "env:etherscan-api-key" },
    credentials: new M5ProviderEnvironmentCredentialResolver(), transport: new M5NodeProviderHttpTransport(), rateLimit: new M5InProcessProviderRateLimitLease(),
    requestedAt: asOf, startedAt: asOf, recordedAt: asOf });
  console.log(JSON.stringify({ status: result.status, ...(result.status === "READY" ? { scope: result.scope, payloadFingerprint: result.payloadFingerprint, recordCount: result.normalizedPackage.records.length } : { code: result.code }) }));
  if (result.status === "BLOCKED" || result.status === "INVALID") process.exitCode = 2;
  else if (result.status === "INFRASTRUCTURE_FAILURE") process.exitCode = 3;
}

if (process.argv[1]?.endsWith("m5-provider-acquire.ts")) {
  main().catch(() => { console.error(JSON.stringify({ status: "INFRASTRUCTURE_FAILURE", code: "M5_PROVIDER_ACQUIRE_FAILURE" })); process.exitCode = 3; });
}
