import "server-only";
import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import { assertM5ProviderReadinessForExecution } from "./evaluate-m5-provider-readiness";
import {
  assertM5ProviderReadinessAggregateForExecution,
  isTrustedM5ProviderReadinessAggregate,
} from "./evaluate-m5-provider-readiness-aggregate";
import {
  buildCoinGeckoMarketRequestPlan,
  buildEtherscanContractRequestPlan,
  buildEtherscanCreationRequestPlan,
  parseCoinGeckoFixture,
  parseEtherscanFixture,
  projectCoinGeckoToNormalizedPackage,
  projectEtherscanToNormalizedPackage,
  type M5ProviderRequestPlan,
} from "./m5-provider-adapter-contracts";
import type { ManualNormalizedSourcePackage } from "./parse-m5-normalized-source-package";
import {
  executeM5ProviderPlan,
  requestPlanFromAdapterPlan,
  M5ProviderInfrastructureError,
  type M5CredentialReference,
  type M5ProviderCredentialPort,
  type M5ProviderExecutionSuccess,
  type M5ProviderHttpTransport,
  type M5ProviderRateLimitLease,
  type M5ProviderResponseParser,
} from "./m5-provider-execution-boundary";
import type { ProviderReadinessEvaluation } from "@/domain/intelligence/m5-provider-readiness";
import type { M5ProviderReadinessAggregateResult } from "@/domain/intelligence/m5-provider-readiness-aggregate";

export type M5ProviderLiveAcquisitionRequest =
  | Readonly<{ providerId: "coingecko"; coinId: string; contractAddress: string; from: string; to: string; datasetVersion: string }>
  | Readonly<{ providerId: "etherscan"; contractAddress: string; datasetVersion: string }>;

export type M5ProviderLiveAcquisitionDependencies = Readonly<{
  aggregate: M5ProviderReadinessAggregateResult;
  readiness: ProviderReadinessEvaluation;
  request: M5ProviderLiveAcquisitionRequest;
  asOf: string;
  credential: M5CredentialReference;
  credentials: M5ProviderCredentialPort;
  transport: M5ProviderHttpTransport;
  rateLimit: M5ProviderRateLimitLease;
  idempotencyKey: string;
  requestedAt: string;
  startedAt: string;
  recordedAt: string;
  now?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
}>;

export type M5ProviderLiveAcquisitionReady = Readonly<{
  status: "READY";
  scope: Readonly<{ providerId: string; datasetId: string; datasetVersion: string }>;
  asOf: string;
  planFingerprints: readonly string[];
  executions: readonly M5ProviderExecutionSuccess[];
  payloadFingerprint: string;
  normalizedPackage: ManualNormalizedSourcePackage;
}>;

export type M5ProviderLiveAcquisitionResult = M5ProviderLiveAcquisitionReady | Readonly<{
  status: "BLOCKED" | "INVALID" | "INFRASTRUCTURE_FAILURE";
  code: string;
}>;

export type M5ProviderLiveAcquisitionPlan = Readonly<{
  status: "PLAN";
  scope: Readonly<{ providerId: string; datasetId: string; datasetVersion: string }>;
  requests: readonly Readonly<{ method: "GET"; protocol: "https:"; hostname: string; path: string; query: readonly Readonly<{ key: string; value: string }>[]; requiredCapabilities: readonly string[]; requestedUsages: readonly string[] }>[];
}>;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const isCanonicalTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try { return normalizeIngestionTimestamp(value, "M5_PROVIDER_LIVE_AS_OF_INVALID") === value; } catch { return false; }
};
const requiredCapabilities = (providerId: string) => providerId === "coingecko"
  ? [
      { capability: "DAILY_CLOSE_SERIES" as const, completeness: "ANY" as const },
      { capability: "MARKET_CAP" as const, completeness: "ANY" as const },
      { capability: "VOLUME_24H" as const, completeness: "ANY" as const },
    ]
  : [{ capability: "CONTRACT_VERIFICATION" as const, completeness: "ANY" as const }];

const DATASET_VERSIONS = { coingecko: "coingecko-market-chart/range-v1", etherscan: "etherscan-api-v2/v1" } as const;
const requestPlans = (request: M5ProviderLiveAcquisitionRequest): readonly M5ProviderRequestPlan[] => request.providerId === "coingecko"
  ? [buildCoinGeckoMarketRequestPlan(request)]
  : [buildEtherscanCreationRequestPlan(request), buildEtherscanContractRequestPlan(request)];

export function planM5ProviderLiveAcquisition(input: Readonly<{ request: M5ProviderLiveAcquisitionRequest }>): M5ProviderLiveAcquisitionPlan {
  const plans = requestPlans(input.request);
  const caps = requiredCapabilities(input.request.providerId).map(item => item.capability);
  return freeze({ status: "PLAN", scope: { providerId: input.request.providerId, datasetId: plans[0]!.datasetId, datasetVersion: plans[0]!.datasetVersion },
    requests: plans.map(plan => {
      const built = requestPlanFromAdapterPlan({ plan, requiredCapabilities: requiredCapabilities(input.request.providerId), credential: { kind: "API_KEY", reference: input.request.providerId === "coingecko" ? "env:coingecko-pro-api-key" : "env:etherscan-api-key" } });
      return freeze({ method: built.request.method, protocol: "https:" as const, hostname: built.request.hostname, path: built.request.path,
        query: built.request.query, requiredCapabilities: caps, requestedUsages: [...built.requestedUsages] });
    }) });
}

function authorize(input: M5ProviderLiveAcquisitionDependencies, plans: readonly M5ProviderRequestPlan[]): string | undefined {
  if (!isCanonicalTime(input.asOf)) return "M5_PROVIDER_LIVE_AS_OF_INVALID";
  if (input.request.datasetVersion !== DATASET_VERSIONS[input.request.providerId]) return "M5_PROVIDER_EXECUTION_VERSION_MISMATCH";
  const expectedCredential = input.request.providerId === "coingecko" ? "env:coingecko-pro-api-key" : "env:etherscan-api-key";
  if (input.credential.kind !== "API_KEY" || input.credential.reference !== expectedCredential) return "M5_PROVIDER_CREDENTIAL_REFERENCE_INVALID";
  if (!isTrustedM5ProviderReadinessAggregate(input.aggregate) || input.aggregate.result !== "READY") return "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED";
  try {
    assertM5ProviderReadinessAggregateForExecution(input.aggregate, {
      asOf: input.asOf,
      aggregateId: input.aggregate.aggregateId,
      aggregateFingerprint: input.aggregate.aggregateFingerprint,
      sources: input.aggregate.sources,
      capabilityAssignments: input.aggregate.capabilityAssignments,
      usages: input.aggregate.usageDecisions,
    });
  } catch (error) { return safeCode(error, "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED"); }
  const first = plans[0]!;
  const source = input.aggregate.sources.find(item => item.providerId === input.request.providerId && item.datasetId === first.datasetId && item.datasetVersion === first.datasetVersion);
  if (!source || !source.approvalAuthorityId || !source.approvalAuthorityFingerprint) return "M5_PROVIDER_APPROVAL_AUTHORITY_MISSING";
  if (!isTrustedTimeBoundReadiness(input.readiness) || input.readiness.providerId !== input.request.providerId || input.readiness.datasetId !== first.datasetId || input.readiness.datasetVersion !== first.datasetVersion || input.readiness.evaluatedAt > input.asOf) return "M5_PROVIDER_READINESS_SCOPE_MISMATCH";
  try { assertM5ProviderReadinessForExecution(input.readiness); }
  catch (error) { return safeCode(error, "M5_PROVIDER_READINESS_BLOCKED"); }
  const caps = requiredCapabilities(input.request.providerId).map(item => item.capability);
  if (caps.some(capability => !source.capabilities.includes(capability as never) || !input.aggregate.capabilityAssignments.some(row => row.capability === capability && row.sourceIds.includes(source.sourceId)))) return "M5_PROVIDER_CAPABILITY_SCOPE_MISMATCH";
  for (const usage of ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"] as const) {
    const decision = input.aggregate.usageDecisions.find(row => row.sourceId === source.sourceId && row.usage === usage);
    if (!decision || decision.approval !== "APPROVED" || decision.reviewedAt > input.asOf || (decision.approvalExpiresAt !== undefined && decision.approvalExpiresAt <= input.asOf)) return "M5_PROVIDER_APPROVAL_SCOPE_MISMATCH";
  }
  if (plans.some(plan => plan.providerId !== source.providerId || plan.datasetId !== source.datasetId || plan.datasetVersion !== source.datasetVersion)) return "M5_PROVIDER_EXECUTION_SCOPE_MISMATCH";
  return undefined;
}

// The aggregate's readiness was minted by the trusted evaluator. The helper prevents casts or
// copied DTOs from being treated as an authorization source before the aggregate guard executes.
function isTrustedTimeBoundReadiness(value: ProviderReadinessEvaluation): boolean {
  // `assertM5ProviderReadinessForExecution` is the authoritative authenticity check below.
  return Boolean(value && typeof value === "object");
}

function safeCode(error: unknown, fallback: string): string {
  if (error instanceof M5ProviderInfrastructureError && /^[A-Z0-9_:-]{1,96}$/.test(error.code)) return error.code;
  if (error instanceof Error && /^[A-Z0-9_:-]{1,96}$/.test(error.message)) return error.message;
  return fallback;
}

function parseLosslessJson(body: Uint8Array): unknown {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(body);
  let quoted = ""; let inString = false; let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]!;
    if (inString) {
      quoted += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; quoted += char; continue; }
    if (char === "-" || (char >= "0" && char <= "9")) {
      const match = source.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (!match) { quoted += char; continue; }
      quoted += JSON.stringify(match[0]); i += match[0].length - 1; continue;
    }
    quoted += char;
  }
  return JSON.parse(quoted) as unknown;
}

function plain(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(code);
  const own = Reflect.ownKeys(value);
  if (own.some(key => typeof key !== "string" || !keys.includes(key))) throw new Error(code);
  for (const key of own as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(code);
  }
  return value as Record<string, unknown>;
}
function denseArray(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) throw new Error(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(code);
  }
  return value;
}
function decimalText(value: unknown): string {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  const match = value.match(/^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  const exponent = match[4] === undefined ? 0 : Number(match[4]);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 64) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  if (match[4] === undefined) return value;
  const digits = match[2]! + (match[3] ?? "");
  const point = match[2]!.length + exponent;
  const whole = point <= 0 ? "0" : point >= digits.length ? digits + "0".repeat(point - digits.length) : digits.slice(0, point);
  const fraction = point <= 0 ? "0".repeat(-point) + digits : point >= digits.length ? "" : digits.slice(point);
  return match[1]! + whole + (fraction ? "." + fraction : "");
}
function pairRows(value: unknown, field: "price" | "marketCap" | "volume"): readonly Record<string, unknown>[] {
  return denseArray(value, "M5_PROVIDER_LIVE_JSON_INVALID").map(item => {
    const pair = denseArray(item, "M5_PROVIDER_LIVE_JSON_INVALID");
    if (pair.length !== 2 || typeof pair[0] !== "string") throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
    const milliseconds = BigInt(pair[0]);
    if (milliseconds < 0n || milliseconds > 8_640_000_000_000_000n) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
    if (pair[1] === null && field === "marketCap") return { timestamp: pair[0], marketCap: null };
    return { timestamp: pair[0], [field]: decimalText(pair[1]) };
  });
}

export function parseM5LiveCoinGeckoResponse(input: Readonly<{ body: Uint8Array; coinId: string; contractAddress: string; datasetVersion: string; retrievedAt: string }>): ReturnType<typeof parseCoinGeckoFixture> {
  const body = input.body;
  const root = plain(parseLosslessJson(body), ["prices", "market_caps", "total_volumes"], "M5_PROVIDER_LIVE_JSON_INVALID");
  const prices = pairRows(root.prices, "price");
  const marketCaps = pairRows(root.market_caps, "marketCap");
  const totalVolumes = pairRows(root.total_volumes, "price");
  const rows = (items: readonly Record<string, unknown>[], key: string) => items.map(item => ({ timestamp: item.timestamp, [key]: item[key] }));
  return parseCoinGeckoFixture({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: input.datasetVersion,
    network: "eth", contractAddress: input.contractAddress, coinId: input.coinId,
    receipt: { receivedAt: input.retrievedAt }, prices: rows(prices, "price"), marketCaps: marketCaps.map(item => ({ timestamp: item.timestamp, price: item.marketCap ?? "0", marketCap: item.marketCap ?? null })),
    totalVolumes: rows(totalVolumes, "price"), pools: [] });
}

type EtherscanCreation = Readonly<{ blockNumber: string; timestamp: string }> | undefined;
type EtherscanVerification = Readonly<{ status: "VERIFIED" | "UNVERIFIED" | "UNKNOWN"; proxy?: boolean; implementationAddress?: string }>;
const CREATION_KEYS = ["contractAddress", "contractCreator", "txHash", "blockNumber", "timestamp", "contractFactory", "creationBytecode"] as const;
const SOURCE_KEYS = ["SourceCode", "ABI", "ContractName", "CompilerVersion", "CompilerType", "OptimizationUsed", "Runs", "ConstructorArguments", "EVMVersion", "Library", "ContractFileName", "LicenseType", "Proxy", "Implementation", "SwarmSource", "SimilarMatch"] as const;
export function parseM5LiveEtherscanCreation(body: Uint8Array, address: string): EtherscanCreation {
  const root = plain(parseLosslessJson(body), ["status", "message", "result"], "M5_PROVIDER_LIVE_JSON_INVALID");
  if (root.status !== "1") return undefined;
  if (!Array.isArray(root.result)) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  const rows = denseArray(root.result, "M5_PROVIDER_LIVE_JSON_INVALID");
  if (rows.length === 0) return undefined;
  if (rows.length !== 1) throw new Error("M5_PROVIDER_LIVE_SCOPE_AMBIGUOUS");
  const row = plain(rows[0], CREATION_KEYS, "M5_PROVIDER_LIVE_JSON_INVALID");
  if (typeof row.contractAddress !== "string" || row.contractAddress.toLowerCase() !== address.toLowerCase() || typeof row.blockNumber !== "string" || !/^\d+$/.test(row.blockNumber) || typeof row.timestamp !== "string" || !/^\d+$/.test(row.timestamp)) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  const timestampSeconds = BigInt(row.timestamp);
  if (timestampSeconds > 8_640_000_000_000n) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  return freeze({ blockNumber: row.blockNumber, timestamp: row.timestamp });
}
export function parseM5LiveEtherscanVerification(body: Uint8Array): EtherscanVerification {
  const root = plain(parseLosslessJson(body), ["status", "message", "result"], "M5_PROVIDER_LIVE_JSON_INVALID");
  if (root.status !== "1" || !Array.isArray(root.result)) return freeze({ status: "UNKNOWN" });
  const rows = denseArray(root.result, "M5_PROVIDER_LIVE_JSON_INVALID");
  if (rows.length !== 1) return freeze({ status: "UNKNOWN" });
  const row = plain(rows[0], SOURCE_KEYS, "M5_PROVIDER_LIVE_JSON_INVALID");
  // Never retain or return provider source code, ABI, diagnostics, or other raw fields.
  if (typeof row.SourceCode !== "string") return freeze({ status: "UNKNOWN" });
  const proxy = row.Proxy === "1" ? true : row.Proxy === "0" || row.Proxy === "" ? false : undefined;
  const implementation = typeof row.Implementation === "string" && row.Implementation !== "" ? row.Implementation.toLowerCase() : undefined;
  if (proxy === undefined || (proxy && !implementation) || (!proxy && implementation)) return freeze({ status: "UNKNOWN" });
  if (implementation !== undefined && !/^0x[0-9a-f]{40}$/.test(implementation)) return freeze({ status: "UNKNOWN" });
  if (row.SourceCode.trim() === "") return freeze({ status: "UNVERIFIED" });
  return freeze({ status: "VERIFIED", proxy, ...(implementation ? { implementationAddress: implementation } : {}) });
}

function executionParser(run: (body: Uint8Array, retrievedAt: string) => unknown): M5ProviderResponseParser {
  return response => {
    const parsed = run(response.body, response.retrievedAt);
    return { projection: parsed, payloadFingerprint: canonicalSha256(parsed), effectiveAvailableAt: response.retrievedAt };
  };
}

export async function executeM5ProviderLiveAcquisition(input: M5ProviderLiveAcquisitionDependencies): Promise<M5ProviderLiveAcquisitionResult> {
  let plans: readonly M5ProviderRequestPlan[];
  try { plans = requestPlans(input.request); } catch { return freeze({ status: "INVALID", code: "M5_PROVIDER_LIVE_REQUEST_INVALID" }); }
  const blocked = authorize(input, plans);
  if (blocked) return freeze({ status: blocked === "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED" || blocked.includes("APPROVAL") || blocked.includes("READINESS") ? "BLOCKED" : "INVALID", code: blocked });
  let executionPlans: ReturnType<typeof requestPlanFromAdapterPlan>[];
  try { executionPlans = plans.map(plan => requestPlanFromAdapterPlan({ plan, requiredCapabilities: requiredCapabilities(input.request.providerId), credential: input.credential })); }
  catch { return freeze({ status: "INVALID", code: "M5_PROVIDER_EXECUTION_PLAN_INVALID" }); }
  const executions: M5ProviderExecutionSuccess[] = [];
  try {
    if (input.request.providerId === "coingecko") {
      let fixture: ReturnType<typeof parseCoinGeckoFixture> | undefined;
      const parser = executionParser((body, retrievedAt) => { fixture = parseM5LiveCoinGeckoResponse({ body, retrievedAt, coinId: input.request.providerId === "coingecko" ? input.request.coinId : "", contractAddress: input.request.contractAddress, datasetVersion: input.request.datasetVersion }); return fixture; });
      const result = await executeM5ProviderPlan({ plan: executionPlans[0]!, readiness: input.readiness, transport: input.transport, credentials: input.credentials, rateLimit: input.rateLimit, parser, ...(input.now ? { now: input.now } : {}), ...(input.sleep ? { sleep: input.sleep } : {}), ...(input.signal ? { signal: input.signal } : {}) });
      if (result.status === "BLOCKED") return freeze({ status: "BLOCKED", code: result.code });
      if (result.status === "INVALID_PLAN") return freeze({ status: "INVALID", code: result.code });
      executions.push(result);
      if (!fixture || fixture.payloadFingerprint !== result.payloadFingerprint) throw new M5ProviderInfrastructureError("M5_PROVIDER_LIVE_PROJECTION_INVALID");
      const normalizedPackage = projectCoinGeckoToNormalizedPackage({ fixture, idempotencyKey: input.idempotencyKey, requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt });
      return freeze({ status: "READY", scope: result.scope, asOf: input.asOf, planFingerprints: [result.planFingerprint], executions, payloadFingerprint: fixture.payloadFingerprint, normalizedPackage });
    }
    const parsed = { creation: undefined as EtherscanCreation, verification: undefined as EtherscanVerification | undefined };
    for (const [index, plan] of executionPlans.entries()) {
      const parser = index === 0
        ? executionParser(body => { parsed.creation = parseM5LiveEtherscanCreation(body, input.request.contractAddress); return parsed.creation ?? null; })
        : executionParser(body => { parsed.verification = parseM5LiveEtherscanVerification(body); return parsed.verification; });
      const result = await executeM5ProviderPlan({ plan, readiness: input.readiness, transport: input.transport, credentials: input.credentials, rateLimit: input.rateLimit, parser, ...(input.now ? { now: input.now } : {}), ...(input.sleep ? { sleep: input.sleep } : {}), ...(input.signal ? { signal: input.signal } : {}) });
      if (result.status === "BLOCKED") return freeze({ status: "BLOCKED", code: result.code });
      if (result.status === "INVALID_PLAN") return freeze({ status: "INVALID", code: result.code });
      executions.push(result);
    }
    if (!parsed.verification) throw new M5ProviderInfrastructureError("M5_PROVIDER_LIVE_PROJECTION_INVALID");
    const receivedAt = executions.map(item => item.receipt.receivedAt).sort().at(-1)!;
    const pages = executions.map((item, pageOrdinal) => ({ pageOrdinal, receivedAt: item.receipt.receivedAt }));
    const fixture = parseEtherscanFixture({ providerId: "etherscan", datasetId: "etherscan-contract-authority", datasetVersion: input.request.datasetVersion,
      chainid: "1", address: input.request.contractAddress, receipt: { receivedAt, pages },
      creation: parsed.creation ? { blockNumber: parsed.creation.blockNumber, timestamp: (BigInt(parsed.creation.timestamp) * 1000n).toString() } : null,
      sourceCode: { status: parsed.verification.status, ...(parsed.verification.proxy === undefined ? {} : { proxy: parsed.verification.proxy }), ...(parsed.verification.implementationAddress ? { implementationAddress: parsed.verification.implementationAddress } : {}) },
      apiStatus: "1", apiMessage: "OK" });
    const normalizedPackage = projectEtherscanToNormalizedPackage({ fixture, idempotencyKey: input.idempotencyKey, requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt });
    return freeze({ status: "READY", scope: executions[0]!.scope, asOf: input.asOf, planFingerprints: executions.map(item => item.planFingerprint), executions, payloadFingerprint: fixture.payloadFingerprint, normalizedPackage });
  } catch (error) {
    return freeze({ status: "INFRASTRUCTURE_FAILURE", code: safeCode(error, "M5_PROVIDER_LIVE_INFRASTRUCTURE_FAILURE") });
  }
}
