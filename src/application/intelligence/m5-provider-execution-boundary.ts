import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import {
  assertM5ProviderReadinessForExecution,
} from "./evaluate-m5-provider-readiness";
import type { ProviderCapabilityRequirement, ProviderReadinessEvaluation, ProviderReadinessExecutionRequest } from "@/domain/intelligence/m5-provider-readiness";

export const M5_PROVIDER_EXECUTION_PLAN_VERSION = "m5-provider-execution-plan/v1" as const;
export const M5_PROVIDER_EXECUTION_POLICY_VERSION = "m5-provider-execution-policy/v1" as const;

export type M5CredentialKind = "NONE" | "API_KEY" | "BEARER_TOKEN";
export type M5HttpMethod = "GET";
export type M5ExecutionResultStatus = "EXECUTED" | "BLOCKED" | "INVALID_PLAN";

export type M5CredentialReference = Readonly<{
  kind: M5CredentialKind;
  reference: string;
}>;

export type M5ProviderQueryParameter = Readonly<{ key: string; value: string }>;

export type M5RetryPolicy = Readonly<{
  maxAttempts: number;
  totalBudgetMs: number;
  maxRetryAfterMs: number;
}>;

export type M5ProviderExecutionPlan = Readonly<{
  planVersion: typeof M5_PROVIDER_EXECUTION_PLAN_VERSION;
  policyVersion: typeof M5_PROVIDER_EXECUTION_POLICY_VERSION;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  adapterContractVersion: string;
  parserContractVersion: string;
  requiredCapabilities: readonly ProviderCapabilityRequirement[];
  requestedUsages: readonly ("NETWORK_ACQUISITION" | "RAW_PAYLOAD_PROCESSING")[];
  credential: M5CredentialReference;
  request: Readonly<{
    method: M5HttpMethod;
    hostname: string;
    path: string;
    query: readonly M5ProviderQueryParameter[];
  }>;
  limits: Readonly<{
    timeoutMs: number;
    maxResponseBytes: number;
  }>;
  retry: M5RetryPolicy;
  pagination?: Readonly<{
    pageOrdinal: number;
    maxPages: number;
    cursorKey: string;
  }>;
}>;

export type M5StructuredProviderRequest = Readonly<{
  method: M5HttpMethod;
  hostname: string;
  path: string;
  query: readonly M5ProviderQueryParameter[];
}>;

export type M5EphemeralCredential = Readonly<{
  kind: M5CredentialKind;
  value?: string;
}>;

export type M5ProviderHttpTransportRequest = Readonly<{
  request: M5StructuredProviderRequest;
  credential: M5EphemeralCredential;
  timeoutMs: number;
  maxResponseBytes: number;
  redirectPolicy: "ERROR";
  signal?: AbortSignal;
  attemptOrdinal: number;
}>;

export type M5ProviderHttpTransportResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array | AsyncIterable<Uint8Array>;
  retrievedAt: string;
  providerRequestId?: string;
}>;

export interface M5ProviderHttpTransport {
  send(request: M5ProviderHttpTransportRequest): Promise<M5ProviderHttpTransportResponse>;
}

export interface M5ProviderCredentialPort {
  resolve(reference: M5CredentialReference): Promise<M5EphemeralCredential>;
}

export interface M5ProviderRateLimitLease {
  acquire(scope: Readonly<{ providerId: string; datasetId: string; credentialReference: string }>): Promise<boolean>;
}

export type M5ProviderResponseProjection = Readonly<{
  projection: unknown;
  payloadFingerprint: string;
  effectiveAvailableAt: string;
  nextCursor?: string;
  isFinal?: boolean;
}>;

export type M5ProviderResponseParser = (input: Readonly<{
  plan: M5ProviderExecutionPlan;
  status: number;
  contentType?: string;
  body: Uint8Array;
  retrievedAt: string;
}>) => M5ProviderResponseProjection;

export type M5ProviderExecutionReceipt = Readonly<{
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  planFingerprint: string;
  receivedAt: string;
  effectiveAvailableAt: string;
  attemptCount: number;
  providerRequestId?: string;
}>;

export type M5ProviderExecutionSuccess = Readonly<{
  status: "EXECUTED";
  planFingerprint: string;
  scope: Readonly<{ providerId: string; datasetId: string; datasetVersion: string }>;
  receipt: M5ProviderExecutionReceipt;
  projection: unknown;
  payloadFingerprint: string;
}>;

export type M5ProviderExecutionBlocked = Readonly<{
  status: "BLOCKED";
  code: string;
}>;

export type M5ProviderExecutionInvalid = Readonly<{
  status: "INVALID_PLAN";
  code: string;
}>;

export type M5ProviderExecutionResult = M5ProviderExecutionSuccess | M5ProviderExecutionBlocked | M5ProviderExecutionInvalid;

export class M5ProviderInfrastructureError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "M5ProviderInfrastructureError";
    this.code = code;
  }
}

type Obj = Record<string, unknown>;
const ID = /^[a-z0-9][a-z0-9._:/-]*$/;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SECRET_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token|private[-_]?key)/i;
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_TIMEOUT_MS = 120_000;
const MAX_TOTAL_BUDGET_MS = 300_000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_RETRY_AFTER_MS = 30_000;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Obj)) freeze(child);
  }
  return value;
};

const stableCompare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const stableSort = <T>(values: readonly T[], key: (value: T) => string): readonly T[] => [...values].sort((a, b) => stableCompare(key(a), key(b)));
const nonBlank = (value: unknown, code: string, max = 256): string => {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.length > max || CONTROL.test(value)) throw new M5ProviderInfrastructureError(code);
  return value;
};
const id = (value: unknown, code: string): string => {
  const result = nonBlank(value, code);
  if (!ID.test(result)) throw new M5ProviderInfrastructureError(code);
  return result;
};
const integer = (value: unknown, code: string, min: number, max: number): number => {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new M5ProviderInfrastructureError(code);
  return value as number;
};
const object = (value: unknown, code: string): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new M5ProviderInfrastructureError(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new M5ProviderInfrastructureError(code);
  return value as Obj;
};
const exact = (value: Obj, allowed: readonly string[], code: string): void => {
  const set = new Set(allowed);
  const unknown = Object.keys(value).find(key => !set.has(key));
  if (unknown) throw new M5ProviderInfrastructureError(SECRET_KEY.test(unknown) ? "M5_PROVIDER_EXECUTION_SECRET_FIELD_REJECTED" : code);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new M5ProviderInfrastructureError(code);
};

const allowlistFor = (providerId: string): Readonly<{ host: string; pathPrefix: string; queryKeys: readonly string[] }> => {
  if (providerId === "coingecko") return { host: "api.coingecko.com", pathPrefix: "/api/v3/coins/", queryKeys: ["contract_address", "cursor", "from", "interval", "to", "vs_currency"] };
  if (providerId === "etherscan") return { host: "api.etherscan.io", pathPrefix: "/v2/api", queryKeys: ["action", "address", "chainid", "module"] };
  throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PROVIDER_UNREGISTERED");
};

const validatePath = (path: string, prefix: string): string => {
  if (!path.startsWith("/") || CONTROL.test(path) || path.includes("\\") || path.includes("//") || path.includes("?") || path.includes("#")) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PATH_INVALID");
  if (/%(?:2f|2F|5c|5C|2e|2E)/.test(path)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PATH_TRAVERSAL");
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PATH_INVALID"); }
  if (decoded.split("/").some(segment => segment === "." || segment === "..") || !decoded.startsWith(prefix)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PATH_TRAVERSAL");
  return path;
};

const validateQuery = (query: readonly M5ProviderQueryParameter[], allowed: readonly string[]): readonly M5ProviderQueryParameter[] => {
  const seen = new Set<string>();
  const result = query.map(item => {
    const row = object(item, "M5_PROVIDER_EXECUTION_QUERY_INVALID");
    exact(row, ["key", "value"], "M5_PROVIDER_EXECUTION_QUERY_INVALID");
    const key = nonBlank(row.key, "M5_PROVIDER_EXECUTION_QUERY_INVALID", 64);
    const value = nonBlank(row.value, "M5_PROVIDER_EXECUTION_QUERY_INVALID", 1024);
    if (SECRET_KEY.test(key)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_SECRET_QUERY_REJECTED");
    if (!allowed.includes(key)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_QUERY_KEY_REJECTED");
    if (seen.has(key)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_QUERY_DUPLICATE");
    seen.add(key);
    if (CONTROL.test(value) || /[&#?=]/.test(value)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_QUERY_INVALID");
    if (key === "chainid" && !/^\d+$/.test(value)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_QUERY_VALUE_INVALID");
    return freeze({ key, value });
  });
  return freeze(stableSort(result, item => item.key));
};

export function validateM5ProviderExecutionPlan(input: unknown): M5ProviderExecutionPlan {
  try {
    const root = object(input, "M5_PROVIDER_EXECUTION_PLAN_INVALID");
    exact(root, ["planVersion", "policyVersion", "providerId", "datasetId", "datasetVersion", "providerSourceNamespace", "adapterContractVersion", "parserContractVersion", "requiredCapabilities", "requestedUsages", "credential", "request", "limits", "retry", "pagination"], "M5_PROVIDER_EXECUTION_PLAN_UNKNOWN_FIELD");
    if (root.planVersion !== M5_PROVIDER_EXECUTION_PLAN_VERSION || root.policyVersion !== M5_PROVIDER_EXECUTION_POLICY_VERSION) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PLAN_VERSION_INVALID");
    const providerId = id(root.providerId, "M5_PROVIDER_EXECUTION_SCOPE_INVALID");
    const datasetId = id(root.datasetId, "M5_PROVIDER_EXECUTION_SCOPE_INVALID");
    const datasetVersion = id(root.datasetVersion, "M5_PROVIDER_EXECUTION_SCOPE_INVALID");
    const providerSourceNamespace = id(root.providerSourceNamespace, "M5_PROVIDER_EXECUTION_SCOPE_INVALID");
    const adapterContractVersion = id(root.adapterContractVersion, "M5_PROVIDER_EXECUTION_VERSION_INVALID");
    const parserContractVersion = id(root.parserContractVersion, "M5_PROVIDER_EXECUTION_VERSION_INVALID");
    const allowlist = allowlistFor(providerId);
    const capabilities = Array.isArray(root.requiredCapabilities) ? root.requiredCapabilities.map(value => {
      const item = object(value, "M5_PROVIDER_EXECUTION_CAPABILITY_INVALID");
      exact(item, ["capability", "completeness"], "M5_PROVIDER_EXECUTION_CAPABILITY_INVALID");
      const capability = nonBlank(item.capability, "M5_PROVIDER_EXECUTION_CAPABILITY_INVALID", 128) as ProviderCapabilityRequirement["capability"];
      if (item.completeness !== "ANY" && item.completeness !== "COMPLETE") throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CAPABILITY_INVALID");
      return freeze({ capability, completeness: item.completeness as "ANY" | "COMPLETE" });
    }) : (() => { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CAPABILITY_INVALID"); })();
    if (new Set(capabilities.map(item => `${item.capability}:${item.completeness}`)).size !== capabilities.length) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CAPABILITY_DUPLICATE");
    const usages = Array.isArray(root.requestedUsages) ? root.requestedUsages.map(value => nonBlank(value, "M5_PROVIDER_EXECUTION_USAGE_INVALID", 64) as "NETWORK_ACQUISITION" | "RAW_PAYLOAD_PROCESSING") : (() => { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_USAGE_INVALID"); })();
    if (!usages.includes("NETWORK_ACQUISITION") || !usages.includes("RAW_PAYLOAD_PROCESSING") || new Set(usages).size !== usages.length) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_USAGE_INVALID");
    const credential = object(root.credential, "M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
    exact(credential, ["kind", "reference"], "M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
    if (credential.kind !== "NONE" && credential.kind !== "API_KEY" && credential.kind !== "BEARER_TOKEN") throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
    const credentialReference = id(credential.reference, "M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
    const request = object(root.request, "M5_PROVIDER_EXECUTION_REQUEST_INVALID");
    exact(request, ["method", "hostname", "path", "query"], "M5_PROVIDER_EXECUTION_REQUEST_INVALID");
    if (request.method !== "GET") throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_METHOD_REJECTED");
    const hostname = nonBlank(request.hostname, "M5_PROVIDER_EXECUTION_HOST_INVALID", 255).toLowerCase();
    if (!HOST.test(hostname) || hostname !== allowlist.host || /\.$/.test(hostname)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_HOST_REJECTED");
    const path = validatePath(nonBlank(request.path, "M5_PROVIDER_EXECUTION_PATH_INVALID", 2048), allowlist.pathPrefix);
    const query = Array.isArray(request.query) ? validateQuery(request.query, allowlist.queryKeys) : (() => { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_QUERY_INVALID"); })();
    const limits = object(root.limits, "M5_PROVIDER_EXECUTION_LIMITS_INVALID");
    exact(limits, ["timeoutMs", "maxResponseBytes"], "M5_PROVIDER_EXECUTION_LIMITS_INVALID");
    const timeoutMs = integer(limits.timeoutMs, "M5_PROVIDER_EXECUTION_LIMITS_INVALID", 1, MAX_TIMEOUT_MS);
    const maxResponseBytes = integer(limits.maxResponseBytes, "M5_PROVIDER_EXECUTION_LIMITS_INVALID", 1, MAX_RESPONSE_BYTES);
    const retry = object(root.retry, "M5_PROVIDER_EXECUTION_RETRY_INVALID");
    exact(retry, ["maxAttempts", "totalBudgetMs", "maxRetryAfterMs"], "M5_PROVIDER_EXECUTION_RETRY_INVALID");
    const retryPolicy = freeze({ maxAttempts: integer(retry.maxAttempts, "M5_PROVIDER_EXECUTION_RETRY_INVALID", 1, 5), totalBudgetMs: integer(retry.totalBudgetMs, "M5_PROVIDER_EXECUTION_RETRY_INVALID", 1, MAX_TOTAL_BUDGET_MS), maxRetryAfterMs: integer(retry.maxRetryAfterMs, "M5_PROVIDER_EXECUTION_RETRY_INVALID", 0, MAX_RETRY_AFTER_MS) });
    const pagination = root.pagination === undefined ? undefined : (() => {
      const item = object(root.pagination, "M5_PROVIDER_EXECUTION_PAGINATION_INVALID");
      exact(item, ["pageOrdinal", "maxPages", "cursorKey"], "M5_PROVIDER_EXECUTION_PAGINATION_INVALID");
      return freeze({ pageOrdinal: integer(item.pageOrdinal, "M5_PROVIDER_EXECUTION_PAGINATION_INVALID", 0, 10_000), maxPages: integer(item.maxPages, "M5_PROVIDER_EXECUTION_PAGINATION_INVALID", 1, 100), cursorKey: nonBlank(item.cursorKey, "M5_PROVIDER_EXECUTION_PAGINATION_INVALID", 64) });
    })();
    return freeze({ planVersion: M5_PROVIDER_EXECUTION_PLAN_VERSION, policyVersion: M5_PROVIDER_EXECUTION_POLICY_VERSION, providerId, datasetId, datasetVersion, providerSourceNamespace, adapterContractVersion, parserContractVersion, requiredCapabilities: freeze(stableSort(capabilities, item => `${item.capability}:${item.completeness}`)), requestedUsages: freeze([...usages].sort(stableCompare)), credential: freeze({ kind: credential.kind, reference: credentialReference }), request: freeze({ method: "GET" as const, hostname, path, query }), limits: freeze({ timeoutMs, maxResponseBytes }), retry: retryPolicy, ...(pagination === undefined ? {} : { pagination }) });
  } catch (error) {
    if (error instanceof M5ProviderInfrastructureError) throw error;
    throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PLAN_INVALID");
  }
}

export function providerPlanFingerprint(plan: M5ProviderExecutionPlan): string {
  return canonicalSha256({ ...plan, credential: { kind: plan.credential.kind, reference: plan.credential.reference } });
}

export function requestPlanFromAdapterPlan(input: Readonly<{ plan: Readonly<{ providerId: string; datasetId: string; datasetVersion: string; providerSourceNamespace: string; adapterContractVersion: string; parserContractVersion: string; endpointPath: string; query: Readonly<Record<string, string>> }>; requiredCapabilities: readonly ProviderCapabilityRequirement[]; credential: M5CredentialReference; limits?: Partial<M5ProviderExecutionPlan["limits"]>; retry?: Partial<M5RetryPolicy> }>): M5ProviderExecutionPlan {
  return validateM5ProviderExecutionPlan({ planVersion: M5_PROVIDER_EXECUTION_PLAN_VERSION, policyVersion: M5_PROVIDER_EXECUTION_POLICY_VERSION, providerId: input.plan.providerId, datasetId: input.plan.datasetId, datasetVersion: input.plan.datasetVersion, providerSourceNamespace: input.plan.providerSourceNamespace, adapterContractVersion: input.plan.adapterContractVersion, parserContractVersion: input.plan.parserContractVersion, requiredCapabilities: input.requiredCapabilities, requestedUsages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"], credential: input.credential, request: { method: "GET", hostname: input.plan.providerId === "coingecko" ? "api.coingecko.com" : "api.etherscan.io", path: input.plan.endpointPath, query: Object.entries(input.plan.query).map(([key, value]) => ({ key, value })) }, limits: { timeoutMs: input.limits?.timeoutMs ?? 30_000, maxResponseBytes: input.limits?.maxResponseBytes ?? 1_000_000 }, retry: { maxAttempts: input.retry?.maxAttempts ?? 3, totalBudgetMs: input.retry?.totalBudgetMs ?? 30_000, maxRetryAfterMs: input.retry?.maxRetryAfterMs ?? 10_000 } });
}

async function boundedBody(body: Uint8Array | AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE");
    return body;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE");
    chunks.push(chunk);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

const header = (headers: Readonly<Record<string, string>>, key: string): string | undefined => Object.entries(headers).find(([name]) => name.toLowerCase() === key)?.[1];

function retryAfterMs(headers: Readonly<Record<string, string>>, max: number): number {
  const value = header(headers, "retry-after");
  if (value === undefined) return 0;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.min(Math.floor(seconds * 1000), max);
}

export function createNoopM5ProviderRateLimitLease(): M5ProviderRateLimitLease {
  return { acquire: async () => true };
}

export async function executeM5ProviderPlan(input: Readonly<{
  plan: M5ProviderExecutionPlan;
  readiness: ProviderReadinessEvaluation;
  transport: M5ProviderHttpTransport;
  credentials: M5ProviderCredentialPort;
  rateLimit?: M5ProviderRateLimitLease;
  parser: M5ProviderResponseParser;
  now?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
}>): Promise<M5ProviderExecutionResult> {
  let plan: M5ProviderExecutionPlan;
  try { plan = validateM5ProviderExecutionPlan(input.plan); } catch (error) { return { status: "INVALID_PLAN", code: error instanceof M5ProviderInfrastructureError ? error.code : "M5_PROVIDER_EXECUTION_PLAN_INVALID" }; }
  const request: ProviderReadinessExecutionRequest = { providerId: plan.providerId, datasetId: plan.datasetId, datasetVersion: plan.datasetVersion, requiredCapabilities: plan.requiredCapabilities, requestedUsages: plan.requestedUsages };
  try { assertM5ProviderReadinessForExecution(input.readiness, request); } catch (error) { return { status: "BLOCKED", code: error instanceof Error ? error.message : "M5_PROVIDER_READINESS_BLOCKED" }; }
  const now = input.now ?? (() => new Date().toISOString());
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds)));
  const planFingerprint = providerPlanFingerprint(plan);
  let credential: M5EphemeralCredential;
  try { credential = await input.credentials.resolve(plan.credential); } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CREDENTIAL_FAILED"); }
  if (credential.kind !== plan.credential.kind) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CREDENTIAL_KIND_MISMATCH");
  if ((credential.kind === "NONE" && credential.value !== undefined) || (credential.kind !== "NONE" && (credential.value === undefined || credential.value.length === 0))) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
  const startedAt = Date.parse(now());
  if (!Number.isFinite(startedAt)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CLOCK_INVALID");
  let lastRetryable: string | undefined;
  for (let attempt = 1; attempt <= plan.retry.maxAttempts; attempt += 1) {
    if (Date.parse(now()) - startedAt > plan.retry.totalBudgetMs) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RETRY_BUDGET_EXCEEDED");
    const lease = await (input.rateLimit ?? createNoopM5ProviderRateLimitLease()).acquire({ providerId: plan.providerId, datasetId: plan.datasetId, credentialReference: plan.credential.reference });
    if (!lease) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RATE_LIMITED");
    let response: M5ProviderHttpTransportResponse;
    try {
      response = await input.transport.send({ request: plan.request, credential, timeoutMs: plan.limits.timeoutMs, maxResponseBytes: plan.limits.maxResponseBytes, redirectPolicy: "ERROR", signal: input.signal, attemptOrdinal: attempt });
    } catch (error) {
      if (attempt < plan.retry.maxAttempts && error instanceof M5ProviderInfrastructureError && error.code === "M5_PROVIDER_TRANSPORT_TIMEOUT") { lastRetryable = error.code; await sleep(0); continue; }
      if (error instanceof M5ProviderInfrastructureError) throw error;
      throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_TRANSPORT_FAILED");
    }
    if (response.status >= 300 && response.status < 400) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_REDIRECT_REJECTED");
    if (RETRY_STATUSES.has(response.status) && attempt < plan.retry.maxAttempts) { lastRetryable = `HTTP_${response.status}`; await sleep(retryAfterMs(response.headers, plan.retry.maxRetryAfterMs)); continue; }
    if (response.status < 200 || response.status >= 300) throw new M5ProviderInfrastructureError(lastRetryable ?? `M5_PROVIDER_HTTP_${response.status}`);
    const contentType = header(response.headers, "content-type");
    if (response.status !== 204 && (contentType === undefined || !/^application\/json(?:\s*;|$)/i.test(contentType))) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CONTENT_TYPE_REJECTED");
    const body = await boundedBody(response.body, plan.limits.maxResponseBytes);
    if (response.status !== 204) {
      try { new TextDecoder("utf-8", { fatal: true }).decode(body); } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_UTF8_INVALID"); }
    }
    let parsed: M5ProviderResponseProjection;
    try { parsed = input.parser({ plan, status: response.status, ...(contentType === undefined ? {} : { contentType }), body, retrievedAt: response.retrievedAt }); } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PARSER_FAILED"); }
    let receivedAt: string;
    let effectiveAvailableAt: string;
    try {
      receivedAt = normalizeIngestionTimestamp(response.retrievedAt, "M5_PROVIDER_EXECUTION_RECEIPT_TIME_INVALID");
      effectiveAvailableAt = normalizeIngestionTimestamp(parsed.effectiveAvailableAt, "M5_PROVIDER_EXECUTION_AVAILABILITY_INVALID");
    } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RECEIPT_INVALID"); }
    const payloadFingerprint = nonBlank(parsed.payloadFingerprint, "M5_PROVIDER_EXECUTION_PAYLOAD_FINGERPRINT_INVALID", 64);
    if (!/^[a-f0-9]{64}$/.test(payloadFingerprint)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PAYLOAD_FINGERPRINT_INVALID");
    return freeze({ status: "EXECUTED", planFingerprint, scope: freeze({ providerId: plan.providerId, datasetId: plan.datasetId, datasetVersion: plan.datasetVersion }), receipt: freeze({ providerId: plan.providerId, datasetId: plan.datasetId, datasetVersion: plan.datasetVersion, planFingerprint, receivedAt, effectiveAvailableAt, attemptCount: attempt, ...(response.providerRequestId === undefined ? {} : { providerRequestId: nonBlank(response.providerRequestId, "M5_PROVIDER_EXECUTION_RECEIPT_INVALID", 256) }) }), projection: parsed.projection, payloadFingerprint });
  }
  throw new M5ProviderInfrastructureError(lastRetryable ?? "M5_PROVIDER_EXECUTION_RETRY_EXHAUSTED");
}

export async function executeM5ProviderPagination(input: Readonly<{
  initialPlan: M5ProviderExecutionPlan;
  nextPlan: (cursor: string, pageOrdinal: number) => M5ProviderExecutionPlan;
  readiness: ProviderReadinessEvaluation;
  transport: M5ProviderHttpTransport;
  credentials: M5ProviderCredentialPort;
  parser: M5ProviderResponseParser;
  rateLimit?: M5ProviderRateLimitLease;
  now?: () => string;
  sleep?: (milliseconds: number) => Promise<void>;
}>): Promise<Readonly<{ pages: readonly M5ProviderExecutionSuccess[]; effectiveAvailableAt: string }>> {
  const pages: M5ProviderExecutionSuccess[] = [];
  const cursors = new Set<string>();
  let plan = validateM5ProviderExecutionPlan(input.initialPlan);
  let finished = false;
  for (let ordinal = 0; ordinal < (plan.pagination?.maxPages ?? 1); ordinal += 1) {
    if (plan.pagination && plan.pagination.pageOrdinal !== ordinal) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PAGE_ORDINAL_INVALID");
    const result = await executeM5ProviderPlan({ ...input, plan });
    if (result.status !== "EXECUTED") throw new M5ProviderInfrastructureError(result.code);
    pages.push(result);
    const parsed = result.projection as { nextCursor?: unknown; isFinal?: unknown };
    if (parsed.isFinal === true || parsed.nextCursor === undefined || parsed.nextCursor === null) { finished = true; break; }
    if (typeof parsed.nextCursor !== "string" || parsed.nextCursor.length === 0 || parsed.nextCursor.length > 512 || /[\u0000-\u001f\u007f?#]/.test(parsed.nextCursor) || /^https?:\/\//i.test(parsed.nextCursor) || cursors.has(parsed.nextCursor)) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_CURSOR_INVALID");
    cursors.add(parsed.nextCursor);
    plan = validateM5ProviderExecutionPlan(input.nextPlan(parsed.nextCursor, ordinal + 1));
  }
  if (!finished) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_PAGE_LIMIT_EXCEEDED");
  if (pages.length === 0) throw new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_EMPTY_PAGINATION");
  const effectiveAvailableAt = pages.map(page => page.receipt.effectiveAvailableAt).sort(stableCompare).at(-1)!;
  return freeze({ pages, effectiveAvailableAt });
}
