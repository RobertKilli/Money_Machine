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
import { isTrustedM5ProviderReadinessEvaluation } from "@/domain/intelligence/m5-provider-readiness";
import { m5ProviderReadinessEvaluationIdentity, type M5ProviderReadinessAggregateResult } from "@/domain/intelligence/m5-provider-readiness-aggregate";

export type M5ProviderLiveAcquisitionRequest =
  | Readonly<{ providerId: "coingecko"; coinId: string; contractAddress: string; from: string; to: string; datasetVersion: string }>
  | Readonly<{ providerId: "etherscan"; contractAddress: string; datasetVersion: string }>;

export type M5ProviderLiveAcquisitionDependencies = Readonly<{
  aggregate: M5ProviderReadinessAggregateResult;
  readiness: ProviderReadinessEvaluation;
  request: M5ProviderLiveAcquisitionRequest;
  asOf: string;
  currentTime: () => string;
  credential: M5CredentialReference;
  credentials: M5ProviderCredentialPort;
  transport: M5ProviderHttpTransport;
  rateLimit: M5ProviderRateLimitLease;
  requestedAt: string;
  startedAt: string;
  recordedAt: string;
  now?: () => string;
  monotonicNow?: () => number;
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
export function validateM5ProviderAuthorizationTime(asOf: unknown, currentTime: unknown): string | undefined {
  if (!isCanonicalTime(asOf)) return "M5_PROVIDER_LIVE_AS_OF_INVALID";
  if (!isCanonicalTime(currentTime)) return "M5_PROVIDER_LIVE_CLOCK_INVALID";
  if (asOf > currentTime) return "M5_PROVIDER_LIVE_AS_OF_FUTURE";
  if (Date.parse(currentTime) - Date.parse(asOf) > MAX_AS_OF_AGE_MS) return "M5_PROVIDER_LIVE_AS_OF_STALE";
  return undefined;
}
const requiredCapabilities = (providerId: string) => providerId === "coingecko"
  ? [
      { capability: "DAILY_CLOSE_SERIES" as const, completeness: "ANY" as const },
      { capability: "MARKET_CAP" as const, completeness: "ANY" as const },
      { capability: "VOLUME_24H" as const, completeness: "ANY" as const },
    ]
  : [{ capability: "CONTRACT_VERIFICATION" as const, completeness: "ANY" as const }];

const DATASET_VERSIONS = { coingecko: "coingecko-market-chart/range-v1", etherscan: "etherscan-api-v2/v1" } as const;
const MAX_AS_OF_AGE_MS = 5_000;
function checkedLiveRequest(value: unknown): M5ProviderLiveAcquisitionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  const provider = Object.getOwnPropertyDescriptor(value, "providerId");
  if (!provider?.enumerable || !("value" in provider)) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  const fields = provider.value === "coingecko"
    ? ["providerId", "coinId", "contractAddress", "from", "to", "datasetVersion"]
    : provider.value === "etherscan" ? ["providerId", "contractAddress", "datasetVersion"] : [];
  const keys = Reflect.ownKeys(value);
  if (fields.length === 0 || keys.length !== fields.length || keys.some(key => typeof key !== "string" || !fields.includes(key))) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  for (const key of fields) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID"); }
  const row = value as Record<string, unknown>;
  if (provider.value === "coingecko") return Object.freeze({ providerId: "coingecko", coinId: row.coinId as string, contractAddress: row.contractAddress as string, from: row.from as string, to: row.to as string, datasetVersion: row.datasetVersion as string });
  return Object.freeze({ providerId: "etherscan", contractAddress: row.contractAddress as string, datasetVersion: row.datasetVersion as string });
}
function checkedCredentialReference(value: unknown): M5CredentialReference | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== 2 || keys.some(key => typeof key !== "string" || !["kind", "reference"].includes(key))) return undefined;
  if (!keys.every(key => { const descriptor = Object.getOwnPropertyDescriptor(value, key as string); return Boolean(descriptor?.enumerable && "value" in descriptor); })) return undefined;
  const row = value as Record<string, unknown>;
  return Object.freeze({ kind: row.kind as M5CredentialReference["kind"], reference: row.reference as string });
}
function checkedDependencies(value: unknown): M5ProviderLiveAcquisitionDependencies {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  const required = ["aggregate", "readiness", "request", "asOf", "currentTime", "credential", "credentials", "transport", "rateLimit", "requestedAt", "startedAt", "recordedAt"];
  const optional = ["now", "monotonicNow", "sleep", "signal"];
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string" || (!required.includes(key) && !optional.includes(key))) || required.some(key => !keys.includes(key))) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  for (const key of keys as string[]) { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID"); }
  const row = value as Record<string, unknown>;
  const credential = checkedCredentialReference(row.credential);
  if (!credential || typeof row.currentTime !== "function" || !row.credentials || typeof (row.credentials as M5ProviderCredentialPort).resolve !== "function" || !row.transport || typeof (row.transport as M5ProviderHttpTransport).send !== "function" || !row.rateLimit || typeof (row.rateLimit as M5ProviderRateLimitLease).acquire !== "function" || (row.now !== undefined && typeof row.now !== "function") || (row.monotonicNow !== undefined && typeof row.monotonicNow !== "function") || (row.sleep !== undefined && typeof row.sleep !== "function") || (row.signal !== undefined && !(row.signal instanceof AbortSignal))) throw new Error("M5_PROVIDER_LIVE_REQUEST_INVALID");
  return Object.freeze({ aggregate: row.aggregate as M5ProviderReadinessAggregateResult, readiness: row.readiness as ProviderReadinessEvaluation,
    request: checkedLiveRequest(row.request), asOf: row.asOf as string, currentTime: row.currentTime as () => string, credential,
    credentials: row.credentials as M5ProviderCredentialPort, transport: row.transport as M5ProviderHttpTransport, rateLimit: row.rateLimit as M5ProviderRateLimitLease,
    requestedAt: row.requestedAt as string, startedAt: row.startedAt as string, recordedAt: row.recordedAt as string,
    ...(row.now === undefined ? {} : { now: row.now as () => string }), ...(row.monotonicNow === undefined ? {} : { monotonicNow: row.monotonicNow as () => number }), ...(row.sleep === undefined ? {} : { sleep: row.sleep as (milliseconds: number) => Promise<void> }), ...(row.signal === undefined ? {} : { signal: row.signal as AbortSignal }) });
}
const requestPlans = (requestValue: M5ProviderLiveAcquisitionRequest): readonly M5ProviderRequestPlan[] => {
  const request = checkedLiveRequest(requestValue);
  return request.providerId === "coingecko"
    ? [buildCoinGeckoMarketRequestPlan(request)]
    : [buildEtherscanCreationRequestPlan(request), buildEtherscanContractRequestPlan(request)];
};

function acquisitionIdempotencyKey(request: M5ProviderLiveAcquisitionRequest, asOf: string): string {
  const identity = request.providerId === "coingecko"
    ? { providerId: request.providerId, datasetId: "coingecko-market-chart", datasetVersion: request.datasetVersion, chain: "ethereum", contractAddress: request.contractAddress.toLowerCase(), from: request.from, to: request.to, asOf }
    : { providerId: request.providerId, datasetId: "etherscan-contract-authority", datasetVersion: request.datasetVersion, chainId: "1", contractAddress: request.contractAddress.toLowerCase(), asOf };
  return `m5-live-acquisition-${canonicalSha256(identity)}`;
}

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
  if (!isTrustedM5ProviderReadinessAggregate(input.aggregate) || input.aggregate.result !== "READY") return "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED";
  let currentTime: string;
  try { currentTime = input.currentTime(); } catch { return "M5_PROVIDER_LIVE_CLOCK_INVALID"; }
  const timeError = validateM5ProviderAuthorizationTime(input.asOf, currentTime);
  if (timeError) return timeError;
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
  if (input.request.datasetVersion !== DATASET_VERSIONS[input.request.providerId]) return "M5_PROVIDER_EXECUTION_VERSION_MISMATCH";
  if (input.request.providerId === "coingecko" && input.request.coinId !== "ethereum") return "M5_PROVIDER_EXECUTION_SCOPE_MISMATCH";
  if (!checkedCredentialReference(input.credential)) return "M5_PROVIDER_CREDENTIAL_REFERENCE_INVALID";
  const expectedCredential = input.request.providerId === "coingecko" ? "env:coingecko-pro-api-key" : "env:etherscan-api-key";
  if (input.credential.kind !== "API_KEY" || input.credential.reference !== expectedCredential) return "M5_PROVIDER_CREDENTIAL_REFERENCE_INVALID";
  const first = plans[0]!;
  const source = input.aggregate.sources.find(item => item.providerId === input.request.providerId && item.datasetId === first.datasetId && item.datasetVersion === first.datasetVersion);
  if (!source || !source.approvalAuthorityId || !source.approvalAuthorityFingerprint) return "M5_PROVIDER_APPROVAL_AUTHORITY_MISSING";
  if (!isTrustedM5ProviderReadinessEvaluation(input.readiness) || input.readiness.providerId !== input.request.providerId || input.readiness.datasetId !== first.datasetId || input.readiness.datasetVersion !== first.datasetVersion || input.readiness.evaluatedAt > input.asOf) return "M5_PROVIDER_READINESS_SCOPE_MISMATCH";
  const aggregateReadiness = m5ProviderReadinessEvaluationIdentity(input.readiness);
  if (source.readinessResultFingerprint !== aggregateReadiness.readinessResultFingerprint) return "M5_PROVIDER_READINESS_SCOPE_MISMATCH";
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

function safeCode(error: unknown, fallback: string): string {
  const code = error instanceof M5ProviderInfrastructureError ? error.code : error instanceof Error ? error.message : "";
  const known = new Set([
    "M5_AGGREGATE_APPROVAL_AUTHORITY_EXPIRED", "M5_AGGREGATE_APPROVAL_AUTHORITY_INVALID", "M5_AGGREGATE_APPROVAL_AUTHORITY_MISMATCH", "M5_AGGREGATE_APPROVAL_AUTHORITY_MISSING", "M5_AGGREGATE_APPROVAL_AUTHORITY_NOT_APPROVED",
    "M5_AGGREGATE_CAPABILITY_INCOMPLETE", "M5_AGGREGATE_CAPABILITY_NOT_DECLARED", "M5_AGGREGATE_CAPABILITY_NOT_SUPPORTED", "M5_AGGREGATE_CONFIG_INVALID", "M5_AGGREGATE_EVALUATION_INPUT_INVALID", "M5_AGGREGATE_SOURCE_MISSING", "M5_AGGREGATE_SOURCE_NOT_AUTHENTIC", "M5_AGGREGATE_SOURCE_READINESS_BLOCKED", "M5_AGGREGATE_SOURCE_SCOPE_MISMATCH", "M5_AGGREGATE_SOURCE_UNUSED", "M5_AGGREGATE_USAGE_EXPIRED", "M5_AGGREGATE_USAGE_NOT_APPROVED", "M5_AGGREGATE_USAGE_REQUIRES_APPROVAL",
    "M5_APPROVAL_AUTHORITY_EXPIRED", "M5_APPROVAL_AUTHORITY_SCOPE_MISMATCH", "M5_PROVIDER_APPROVAL_AUTHORITY_MISSING", "M5_PROVIDER_APPROVAL_SCOPE_MISMATCH", "M5_PROVIDER_CAPABILITY_SCOPE_MISMATCH", "M5_PROVIDER_CREDENTIAL_REFERENCE_INVALID", "M5_PROVIDER_EXECUTION_PLAN_INVALID", "M5_PROVIDER_EXECUTION_SCOPE_MISMATCH", "M5_PROVIDER_EXECUTION_VERSION_MISMATCH", "M5_PROVIDER_LIVE_AS_OF_INVALID", "M5_PROVIDER_LIVE_AS_OF_FUTURE", "M5_PROVIDER_LIVE_AS_OF_STALE", "M5_PROVIDER_LIVE_CLOCK_INVALID", "M5_PROVIDER_LIVE_INFRASTRUCTURE_FAILURE", "M5_PROVIDER_LIVE_JSON_INVALID", "M5_PROVIDER_LIVE_PROJECTION_INVALID", "M5_PROVIDER_LIVE_REQUEST_INVALID", "M5_PROVIDER_LIVE_SCOPE_AMBIGUOUS", "M5_PROVIDER_READINESS_AGGREGATE_AS_OF_INVALID", "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED", "M5_PROVIDER_READINESS_AGGREGATE_EXPIRED", "M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH", "M5_PROVIDER_READINESS_BLOCKED", "M5_PROVIDER_READINESS_SCOPE_MISMATCH", "M5_READINESS_CONFIG_INVALID",
    "M5_PROVIDER_EXECUTION_AVAILABILITY_INVALID", "M5_PROVIDER_EXECUTION_CAPABILITY_DUPLICATE", "M5_PROVIDER_EXECUTION_CAPABILITY_INVALID", "M5_PROVIDER_EXECUTION_CLOCK_INVALID", "M5_PROVIDER_EXECUTION_CONTENT_ENCODING_REJECTED", "M5_PROVIDER_EXECUTION_CONTENT_TYPE_REJECTED", "M5_PROVIDER_EXECUTION_CREDENTIAL_FAILED", "M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID", "M5_PROVIDER_EXECUTION_CREDENTIAL_KIND_MISMATCH", "M5_PROVIDER_EXECUTION_CURSOR_INVALID", "M5_PROVIDER_EXECUTION_EMPTY_PAGINATION", "M5_PROVIDER_EXECUTION_HOST_INVALID", "M5_PROVIDER_EXECUTION_HOST_REJECTED", "M5_PROVIDER_EXECUTION_LIMITS_INVALID", "M5_PROVIDER_EXECUTION_METHOD_REJECTED", "M5_PROVIDER_EXECUTION_PAGE_LIMIT_EXCEEDED", "M5_PROVIDER_EXECUTION_PAGE_ORDINAL_INVALID", "M5_PROVIDER_EXECUTION_PAGINATION_INVALID", "M5_PROVIDER_EXECUTION_PAGINATION_PLAN_MISMATCH", "M5_PROVIDER_EXECUTION_PAGINATION_UNEXPECTED", "M5_PROVIDER_EXECUTION_PARSER_FAILED", "M5_PROVIDER_EXECUTION_PATH_INVALID", "M5_PROVIDER_EXECUTION_PATH_TRAVERSAL", "M5_PROVIDER_EXECUTION_PAYLOAD_FINGERPRINT_INVALID", "M5_PROVIDER_EXECUTION_PLAN_INVALID", "M5_PROVIDER_EXECUTION_PLAN_UNKNOWN_FIELD", "M5_PROVIDER_EXECUTION_PLAN_VERSION_INVALID", "M5_PROVIDER_EXECUTION_PROVIDER_UNREGISTERED", "M5_PROVIDER_EXECUTION_QUERY_DUPLICATE", "M5_PROVIDER_EXECUTION_QUERY_INVALID", "M5_PROVIDER_EXECUTION_QUERY_KEY_REJECTED", "M5_PROVIDER_EXECUTION_QUERY_SCOPE_INVALID", "M5_PROVIDER_EXECUTION_QUERY_VALUE_INVALID", "M5_PROVIDER_EXECUTION_RATE_LIMIT_FAILED", "M5_PROVIDER_EXECUTION_RATE_LIMITED", "M5_PROVIDER_EXECUTION_RECEIPT_INVALID", "M5_PROVIDER_EXECUTION_RECEIPT_TIME_INVALID", "M5_PROVIDER_EXECUTION_REDIRECT_REJECTED", "M5_PROVIDER_EXECUTION_REQUEST_INVALID", "M5_PROVIDER_EXECUTION_REQUEST_SCOPE_INVALID", "M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE", "M5_PROVIDER_EXECUTION_RETRY_BUDGET_EXCEEDED", "M5_PROVIDER_EXECUTION_RETRY_EXHAUSTED", "M5_PROVIDER_EXECUTION_RETRY_INVALID", "M5_PROVIDER_EXECUTION_SCOPE_INVALID", "M5_PROVIDER_EXECUTION_SECRET_FIELD_REJECTED", "M5_PROVIDER_EXECUTION_SECRET_QUERY_REJECTED", "M5_PROVIDER_EXECUTION_TRANSPORT_FAILED", "M5_PROVIDER_EXECUTION_USAGE_INVALID", "M5_PROVIDER_EXECUTION_UTF8_INVALID", "M5_PROVIDER_EXECUTION_VERSION_INVALID",
    "M5_PROVIDER_TRANSPORT_ABORTED", "M5_PROVIDER_TRANSPORT_CREDENTIAL_REQUIRED", "M5_PROVIDER_TRANSPORT_DNS_FAILED", "M5_PROVIDER_TRANSPORT_DNS_REJECTED", "M5_PROVIDER_TRANSPORT_FAILED", "M5_PROVIDER_TRANSPORT_LIMIT_INVALID", "M5_PROVIDER_TRANSPORT_PATH_REJECTED", "M5_PROVIDER_TRANSPORT_QUERY_REJECTED", "M5_PROVIDER_TRANSPORT_REQUEST_REJECTED", "M5_PROVIDER_TRANSPORT_SCOPE_REJECTED", "M5_PROVIDER_TRANSPORT_TIMEOUT", "M5_PROVIDER_TRANSPORT_TRUNCATED_BODY",
  ]);
  if (known.has(code) || /^M5_PROVIDER_HTTP_[1-5][0-9]{2}$/.test(code)) return code;
  return fallback;
}

class LosslessJsonNumber {
  constructor(readonly lexeme: string) { Object.freeze(this); }
}

function parseLosslessJson(body: Uint8Array): unknown {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(body);
  let offset = 0;
  let nodes = 0;
  const whitespace = () => { while (offset < source.length && /[\u0009\u000a\u000d\u0020]/.test(source[offset]!)) offset += 1; };
  const fail = (): never => { throw new Error("M5_PROVIDER_LIVE_JSON_INVALID"); };
  const parseString = (): string => {
    const start = offset;
    if (source[offset++] !== '"') return fail();
    while (offset < source.length) {
      const code = source.charCodeAt(offset);
      if (code < 0x20) return fail();
      if (source[offset] === "\\") { offset += 1; const escaped = source[offset++]; if (escaped === "u") { if (!/^[0-9a-fA-F]{4}$/.test(source.slice(offset, offset + 4))) return fail(); offset += 4; } else if (!escaped || !/["\\/bfnrt]/.test(escaped)) return fail(); continue; }
      if (source[offset++] === '"') { try { return JSON.parse(source.slice(start, offset)) as string; } catch { return fail(); } }
    }
    return fail();
  };
  const parseValue = (depth: number): unknown => {
    whitespace();
    if (depth > 64 || ++nodes > 100_000) return fail();
    const char = source[offset];
    if (char === '"') return parseString();
    if (char === "{") {
      offset += 1; whitespace();
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const keys = new Set<string>();
      if (source[offset] === "}") { offset += 1; return result; }
      while (true) {
        whitespace(); const key = parseString();
        if (keys.has(key)) return fail(); keys.add(key);
        whitespace(); if (source[offset++] !== ":") return fail();
        const value = parseValue(depth + 1);
        Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
        whitespace(); const separator = source[offset++];
        if (separator === "}") return result;
        if (separator !== ",") return fail();
      }
    }
    if (char === "[") {
      offset += 1; whitespace(); const result: unknown[] = [];
      if (source[offset] === "]") { offset += 1; return result; }
      while (true) {
        result.push(parseValue(depth + 1)); whitespace(); const separator = source[offset++];
        if (separator === "]") return result;
        if (separator !== ",") return fail();
      }
    }
    if (source.startsWith("true", offset)) { offset += 4; return true; }
    if (source.startsWith("false", offset)) { offset += 5; return false; }
    if (source.startsWith("null", offset)) { offset += 4; return null; }
    const numeric = source.slice(offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numeric) { offset += numeric[0].length; return new LosslessJsonNumber(numeric[0]); }
    return fail();
  };
  const result = parseValue(0); whitespace();
  if (offset !== source.length) return fail();
  return result;
}

function plain(value: unknown, keys: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error(code);
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
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  const match = value.match(/^(0|[1-9]\d*)(?:\.(\d+))?$/);
  if (!match) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
  return value;
}
function pairRows(value: unknown, field: "price" | "marketCap" | "volume"): readonly Record<string, unknown>[] {
  return denseArray(value, "M5_PROVIDER_LIVE_JSON_INVALID").map(item => {
    const pair = denseArray(item, "M5_PROVIDER_LIVE_JSON_INVALID");
    if (pair.length !== 2 || !(pair[0] instanceof LosslessJsonNumber)) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
    const milliseconds = BigInt(pair[0].lexeme);
    if (milliseconds < 0n || milliseconds > 8_640_000_000_000_000n) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
    if (pair[1] === null && field === "marketCap") return { timestamp: pair[0].lexeme, marketCap: null };
    if (!(pair[1] instanceof LosslessJsonNumber)) throw new Error("M5_PROVIDER_LIVE_JSON_INVALID");
    return { timestamp: pair[0].lexeme, [field]: decimalText(pair[1].lexeme) };
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
  if (typeof root.result === "string" && /^(?:\s*|no records found|no data found)$/i.test(root.result)) return undefined;
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
  try { input = checkedDependencies(input); } catch { return freeze({ status: "INVALID", code: "M5_PROVIDER_LIVE_REQUEST_INVALID" }); }
  let plans: readonly M5ProviderRequestPlan[];
  try { plans = requestPlans(input.request); } catch { return freeze({ status: "INVALID", code: "M5_PROVIDER_LIVE_REQUEST_INVALID" }); }
  const blocked = authorize(input, plans);
  if (blocked) return freeze({ status: blocked === "M5_PROVIDER_LIVE_CLOCK_INVALID" ? "INFRASTRUCTURE_FAILURE" : blocked === "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED" || blocked.includes("APPROVAL") || blocked.includes("READINESS") ? "BLOCKED" : "INVALID", code: blocked });
  let executionPlans: ReturnType<typeof requestPlanFromAdapterPlan>[];
  try { executionPlans = plans.map(plan => requestPlanFromAdapterPlan({ plan, requiredCapabilities: requiredCapabilities(input.request.providerId), credential: input.credential })); }
  catch { return freeze({ status: "INVALID", code: "M5_PROVIDER_EXECUTION_PLAN_INVALID" }); }
  let attemptAuthorizationFailure: string | undefined;
  const guardedRateLimit: M5ProviderRateLimitLease = { acquire: async scope => {
    let at: string;
    try { at = input.currentTime(); } catch { attemptAuthorizationFailure = "M5_PROVIDER_LIVE_CLOCK_INVALID"; return false; }
    if (!isCanonicalTime(at)) { attemptAuthorizationFailure = "M5_PROVIDER_LIVE_CLOCK_INVALID"; return false; }
    if (Date.parse(at) - Date.parse(input.asOf) > MAX_AS_OF_AGE_MS) { attemptAuthorizationFailure = "M5_PROVIDER_LIVE_AS_OF_STALE"; return false; }
    try {
      assertM5ProviderReadinessAggregateForExecution(input.aggregate, { asOf: at, aggregateId: input.aggregate.aggregateId, aggregateFingerprint: input.aggregate.aggregateFingerprint,
        sources: input.aggregate.sources, capabilityAssignments: input.aggregate.capabilityAssignments, usages: input.aggregate.usageDecisions });
    } catch { attemptAuthorizationFailure = "M5_PROVIDER_READINESS_AGGREGATE_EXPIRED"; return false; }
    try { return await input.rateLimit.acquire(scope); } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RATE_LIMIT_FAILED"); }
  } };
  const executions: M5ProviderExecutionSuccess[] = [];
  try {
    if (input.request.providerId === "coingecko") {
      let fixture: ReturnType<typeof parseCoinGeckoFixture> | undefined;
      const parser = executionParser((body, retrievedAt) => { fixture = parseM5LiveCoinGeckoResponse({ body, retrievedAt, coinId: input.request.providerId === "coingecko" ? input.request.coinId : "", contractAddress: input.request.contractAddress, datasetVersion: input.request.datasetVersion }); return fixture; });
      const result = await executeM5ProviderPlan({ plan: executionPlans[0]!, readiness: input.readiness, transport: input.transport, credentials: input.credentials, rateLimit: guardedRateLimit, parser, ...(input.now ? { now: input.now } : {}), ...(input.monotonicNow ? { monotonicNow: input.monotonicNow } : {}), ...(input.sleep ? { sleep: input.sleep } : {}), ...(input.signal ? { signal: input.signal } : {}) });
      if (result.status === "BLOCKED") return freeze({ status: "BLOCKED", code: result.code });
      if (result.status === "INVALID_PLAN") return freeze({ status: "INVALID", code: result.code });
      executions.push(result);
      if (!fixture || fixture.payloadFingerprint !== result.payloadFingerprint) throw new M5ProviderInfrastructureError("M5_PROVIDER_LIVE_PROJECTION_INVALID");
      const normalizedPackage = projectCoinGeckoToNormalizedPackage({ fixture, idempotencyKey: acquisitionIdempotencyKey(input.request, input.asOf), requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt });
      return freeze({ status: "READY", scope: result.scope, asOf: input.asOf, planFingerprints: [result.planFingerprint], executions, payloadFingerprint: fixture.payloadFingerprint, normalizedPackage });
    }
    const parsed = { creation: undefined as EtherscanCreation, verification: undefined as EtherscanVerification | undefined };
    for (const [index, plan] of executionPlans.entries()) {
      const parser = index === 0
        ? executionParser(body => { parsed.creation = parseM5LiveEtherscanCreation(body, input.request.contractAddress); return parsed.creation ?? null; })
        : executionParser(body => { parsed.verification = parseM5LiveEtherscanVerification(body); return parsed.verification; });
      const result = await executeM5ProviderPlan({ plan, readiness: input.readiness, transport: input.transport, credentials: input.credentials, rateLimit: guardedRateLimit, parser, ...(input.now ? { now: input.now } : {}), ...(input.monotonicNow ? { monotonicNow: input.monotonicNow } : {}), ...(input.sleep ? { sleep: input.sleep } : {}), ...(input.signal ? { signal: input.signal } : {}) });
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
    const normalizedPackage = projectEtherscanToNormalizedPackage({ fixture, idempotencyKey: acquisitionIdempotencyKey(input.request, input.asOf), requestedAt: input.requestedAt, startedAt: input.startedAt, recordedAt: input.recordedAt });
    return freeze({ status: "READY", scope: executions[0]!.scope, asOf: input.asOf, planFingerprints: executions.map(item => item.planFingerprint), executions, payloadFingerprint: fixture.payloadFingerprint, normalizedPackage });
  } catch (error) {
    if (attemptAuthorizationFailure) return freeze({ status: "BLOCKED", code: attemptAuthorizationFailure });
    return freeze({ status: "INFRASTRUCTURE_FAILURE", code: safeCode(error, "M5_PROVIDER_LIVE_INFRASTRUCTURE_FAILURE") });
  }
}
