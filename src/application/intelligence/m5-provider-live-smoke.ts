import "server-only";
import { normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import { buildCoinGeckoMarketRequestPlan, M5_PROVIDER_PARSER_CONTRACT_VERSION } from "./m5-provider-adapter-contracts";
import { parseM5LiveCoinGeckoResponse } from "./m5-provider-live-acquisition";
import { M5ProviderInfrastructureError, requestPlanFromAdapterPlan, type M5ProviderCredentialPort, type M5ProviderHttpTransport, type M5ProviderRateLimitLease, type M5CredentialReference, type M5EphemeralCredential, type M5ProviderHttpTransportResponse } from "./m5-provider-execution-boundary";
import type { ProviderCapabilityRequirement } from "@/domain/intelligence/m5-provider-readiness";
import { parseM5ProviderSmokeAuthorization, resolveTrustedM5ProviderSmokeAuthorization, type M5ProviderSmokeAuthorization, type M5ProviderSmokeAuthorizationRegistryEntry, type TrustedM5ProviderSmokeAuthorization } from "./m5-provider-live-smoke-authorization";

export const M5_PROVIDER_SMOKE_CONFIG_VERSION = "m5-provider-live-smoke-config/v1" as const;
export const M5_PROVIDER_SMOKE_AUTHORITY_STATUS = "NON_AUTHORITATIVE_SMOKE" as const;
const MAX_AS_OF_AGE_MS = 5_000;
const SAFE_SMOKE_FAILURE_CODES = new Set([
  "M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED", "M5_PROVIDER_SMOKE_CREDENTIAL_UNAVAILABLE", "M5_PROVIDER_SMOKE_PROVIDER_HTTP_FAILED",
  "M5_PROVIDER_SMOKE_PROVIDER_RESPONSE_INVALID", "M5_PROVIDER_SMOKE_RATE_LIMITED", "M5_PROVIDER_SMOKE_RECEIPT_INVALID",
  "M5_PROVIDER_SMOKE_REDIRECT_REJECTED", "M5_PROVIDER_SMOKE_REQUEST_BUDGET_EXCEEDED", "M5_PROVIDER_SMOKE_RESPONSE_BUDGET_EXCEEDED",
  "M5_PROVIDER_SMOKE_TIMEOUT", "M5_PROVIDER_SMOKE_TRANSPORT_FAILED", "M5_PROVIDER_SMOKE_TRANSPORT_INVALID",
  "M5_PROVIDER_SMOKE_CLOCK_INVALID",
]);

export type M5ProviderSmokeConfig = Readonly<{
  schemaVersion: typeof M5_PROVIDER_SMOKE_CONFIG_VERSION;
  providerId: "coingecko" | "etherscan";
  contractAddress: string;
  coinId?: string;
  from?: string;
  to?: string;
}>;
export type M5ProviderSmokePlan = Readonly<{
  status: "PLAN";
  environment: "LOCAL_SMOKE";
  authorizationId: string;
  authorizationFingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  endpointProfile: string;
  credentialReferences: readonly string[];
  requestCount: number;
  maximumPages: number;
  maximumResponseBytes: number;
  requests: readonly Readonly<{ method: "GET"; protocol: "https:"; hostname: string; path: string; query: readonly Readonly<{ key: string; value: string }>[] }>[];
}>;
export type M5ProviderSmokeSummary = Readonly<{
  status: "VERIFIED" | "BLOCKED" | "INVALID" | "INFRASTRUCTURE_FAILURE";
  authorityStatus: typeof M5_PROVIDER_SMOKE_AUTHORITY_STATUS;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  requestCount: number;
  parsedRecordCount: number;
  responseTimestamps: readonly string[];
  receiptTimestamps: readonly string[];
  payloadFingerprints: readonly string[];
  parserContractVersion: typeof M5_PROVIDER_PARSER_CONTRACT_VERSION;
  capabilityObservations: readonly Readonly<{ capability: string; outcome: "OBSERVED" | "UNKNOWN" }>[];
  code?: string;
}>;
export type M5ProviderSmokeDependencies = Readonly<{
  config: unknown;
  authorization: unknown;
  providerId: string;
  environment: string;
  asOf: string;
  currentTime: () => string;
  trustedRegistry: readonly M5ProviderSmokeAuthorizationRegistryEntry[];
  credentials: M5ProviderCredentialPort;
  transport: M5ProviderHttpTransport;
  rateLimit: M5ProviderRateLimitLease;
}>;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
function record(value: unknown, allowed: readonly string[], required: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string" || !allowed.includes(key)) || required.some(key => !keys.includes(key))) throw new Error(code);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(code);
  }
  return value as Record<string, unknown>;
}
function checkedDependencies(value: unknown): M5ProviderSmokeDependencies {
  const fields = ["config", "authorization", "providerId", "environment", "asOf", "currentTime", "trustedRegistry", "credentials", "transport", "rateLimit"];
  const root = record(value, fields, fields, "M5_PROVIDER_SMOKE_DEPENDENCIES_INVALID");
  if (typeof root.providerId !== "string" || typeof root.environment !== "string" || typeof root.asOf !== "string" || typeof root.currentTime !== "function" || !root.credentials || typeof (root.credentials as M5ProviderCredentialPort).resolve !== "function" || !root.transport || typeof (root.transport as M5ProviderHttpTransport).send !== "function" || !root.rateLimit || typeof (root.rateLimit as M5ProviderRateLimitLease).acquire !== "function") throw new Error("M5_PROVIDER_SMOKE_DEPENDENCIES_INVALID");
  return Object.freeze({ config: root.config, authorization: root.authorization, providerId: root.providerId, environment: root.environment, asOf: root.asOf, currentTime: root.currentTime as () => string,
    trustedRegistry: root.trustedRegistry as readonly M5ProviderSmokeAuthorizationRegistryEntry[], credentials: root.credentials as M5ProviderCredentialPort,
    transport: root.transport as M5ProviderHttpTransport, rateLimit: root.rateLimit as M5ProviderRateLimitLease });
}
function canonicalTime(value: unknown, code: string): string {
  if (typeof value !== "string" || normalizeIngestionTimestamp(value, code) !== value) throw new Error(code);
  return value;
}
const credentialReference = (provider: string, endpointProfile?: string): M5CredentialReference => Object.freeze({ kind: "API_KEY", reference: provider === "coingecko" && endpointProfile === "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_DEMO" ? "env:coingecko-demo-api-key" : provider === "coingecko" ? "env:coingecko-pro-api-key" : "env:etherscan-api-key" });

export function parseM5ProviderSmokeConfig(value: unknown): M5ProviderSmokeConfig {
  const root = record(value, ["schemaVersion", "providerId", "contractAddress", "coinId", "from", "to"], ["schemaVersion", "providerId", "contractAddress"], "M5_PROVIDER_SMOKE_CONFIG_INVALID");
  if (root.schemaVersion !== M5_PROVIDER_SMOKE_CONFIG_VERSION || (root.providerId !== "coingecko" && root.providerId !== "etherscan")) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  if (typeof root.contractAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(root.contractAddress)) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  if (root.providerId === "coingecko") {
    if (root.coinId !== "ethereum" || typeof root.from !== "string" || typeof root.to !== "string") throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
    const from = canonicalTime(root.from, "M5_PROVIDER_SMOKE_CONFIG_INVALID");
    const to = canonicalTime(root.to, "M5_PROVIDER_SMOKE_CONFIG_INVALID");
    if (from > to || Date.parse(to) - Date.parse(from) > 172_800_000) throw new Error("M5_PROVIDER_SMOKE_CONFIG_BUDGET_INVALID");
    return freeze({ schemaVersion: M5_PROVIDER_SMOKE_CONFIG_VERSION, providerId: "coingecko", contractAddress: root.contractAddress.toLowerCase(), coinId: "ethereum", from, to });
  }
  if (root.coinId !== undefined || root.from !== undefined || root.to !== undefined) throw new Error("M5_PROVIDER_SMOKE_CONFIG_INVALID");
  return freeze({ schemaVersion: M5_PROVIDER_SMOKE_CONFIG_VERSION, providerId: "etherscan", contractAddress: root.contractAddress.toLowerCase() });
}
function trusted(input: M5ProviderSmokeDependencies): TrustedM5ProviderSmokeAuthorization {
  return resolveTrustedM5ProviderSmokeAuthorization({ authorization: input.authorization, registry: input.trustedRegistry, asOf: input.asOf });
}
function requestPlans(config: M5ProviderSmokeConfig, auth: M5ProviderSmokeAuthorization) {
  if (config.providerId !== "coingecko" || config.providerId !== auth.providerId) throw new Error("M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT");
  return [buildCoinGeckoMarketRequestPlan({ coinId: config.coinId!, contractAddress: config.contractAddress, from: config.from!, to: config.to!, datasetVersion: auth.datasetVersion })];
}
function makePlan(config: M5ProviderSmokeConfig, auth: M5ProviderSmokeAuthorization): M5ProviderSmokePlan {
  if (config.providerId !== "coingecko" || auth.providerId !== "coingecko") throw new Error("M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT");
  const credential = credentialReference(config.providerId, auth.endpointProfile);
  const requiredCapabilities = auth.capabilities.map(capability => ({ capability, completeness: "ANY" as const })) as ProviderCapabilityRequirement[];
  const plans = requestPlans(config, auth);
  if (plans.length > auth.maximumRequests) throw new Error("M5_PROVIDER_SMOKE_REQUEST_BUDGET_EXCEEDED");
  const requests = plans.map(plan => requestPlanFromAdapterPlan({ plan, requiredCapabilities, credential,
    limits: { timeoutMs: 5_000, maxResponseBytes: auth.maximumResponseBytes }, retry: { maxAttempts: 1, totalBudgetMs: 5_000, maxRetryAfterMs: 0 } }));
  return freeze({ status: "PLAN", environment: "LOCAL_SMOKE", authorizationId: auth.authorizationId, authorizationFingerprint: auth.fingerprint,
    providerId: auth.providerId, datasetId: auth.datasetId, datasetVersion: auth.datasetVersion, endpointProfile: auth.endpointProfile,
    credentialReferences: [credential.reference], requestCount: requests.length, maximumPages: auth.maximumPages, maximumResponseBytes: auth.maximumResponseBytes,
    requests: requests.map(plan => ({ ...plan.request, hostname: config.providerId === "coingecko" ? "api.coingecko.com" : plan.request.hostname, protocol: "https:" as const })) });
}

export function planM5ProviderLiveSmoke(input: Readonly<{ config: unknown; authorization: unknown; trustedRegistry: unknown; providerId: string; environment: string; asOf: string }>): M5ProviderSmokePlan {
  const config = parseM5ProviderSmokeConfig(input.config);
  const auth = resolveTrustedM5ProviderSmokeAuthorization({ authorization: input.authorization, registry: input.trustedRegistry, asOf: input.asOf });
  if (input.environment !== "LOCAL_SMOKE" || input.providerId !== config.providerId || auth.environment !== "LOCAL_SMOKE" || auth.providerId !== config.providerId || auth.datasetId === "" || auth.datasetVersion === "") throw new Error("M5_PROVIDER_SMOKE_SCOPE_INVALID");
  return makePlan(config, auth);
}

/** A side-effect-free preview. Its authorization remains untrusted and cannot execute. */
export function previewM5ProviderLiveSmoke(input: Readonly<{ config: unknown; authorization: unknown; providerId: string }>): M5ProviderSmokePlan {
  const config = parseM5ProviderSmokeConfig(input.config);
  const auth = parseM5ProviderSmokeAuthorization(input.authorization);
  if (input.providerId !== config.providerId || auth.providerId !== config.providerId) throw new Error("M5_PROVIDER_SMOKE_SCOPE_INVALID");
  return makePlan(config, auth);
}

function summary(status: M5ProviderSmokeSummary["status"], providerId: string, datasetId: string, datasetVersion: string, code?: string, details: Partial<M5ProviderSmokeSummary> = {}): M5ProviderSmokeSummary {
  return freeze({ status, authorityStatus: M5_PROVIDER_SMOKE_AUTHORITY_STATUS, providerId, datasetId, datasetVersion, requestCount: 0, parsedRecordCount: 0, responseTimestamps: [], receiptTimestamps: [], payloadFingerprints: [], parserContractVersion: M5_PROVIDER_PARSER_CONTRACT_VERSION, capabilityObservations: [], ...(code ? { code } : {}), ...details });
}
function errorStatus(code: string): M5ProviderSmokeSummary["status"] {
  if (code === "M5_PROVIDER_SMOKE_AUTHORITY_CONFLICT" || /(?:AUTHORIZATION|CONFIG|CAPABILITY|USAGE|BUDGET|FINGERPRINT|AS_OF|TIME)_INVALID$/.test(code)) return "INVALID";
  return /AUTHORIZATION|AUTHORITY|SCOPE|ENVIRONMENT|AS_OF|BUDGET|CONFIG|CAPABILITY|USAGE|RETENTION|FINGERPRINT|TIME_INVALID|NOT_TRUSTED|CONFLICT|UNSUPPORTED_AUTHENTICATION_TRANSPORT/.test(code) ? "BLOCKED" : "INVALID";
}
function validCredential(value: M5EphemeralCredential, reference: M5CredentialReference): void {
  if (!value || value.kind !== reference.kind || typeof value.value !== "string" || value.value.length === 0 || value.value.trim() !== value.value || value.value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value.value) || /(?:https?:\/\/|:\/\/|[\/?#&=])/i.test(value.value)) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_CREDENTIAL_INVALID");
}
function validateResponseShape(value: M5ProviderHttpTransportResponse): void {
  if (!value || !Number.isInteger(value.status) || value.status < 100 || value.status > 599 || !value.headers || !(value.body instanceof Uint8Array) || typeof value.retrievedAt !== "string") throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_TRANSPORT_INVALID");
}
async function boundedBody(body: Uint8Array | AsyncIterable<Uint8Array>, maximum: number): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maximum) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_RESPONSE_BUDGET_EXCEEDED");
    return body;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maximum) {
      chunk.fill(0);
      chunks.forEach(item => item.fill(0));
      throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_RESPONSE_BUDGET_EXCEEDED");
    }
    chunks.push(chunk);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  chunks.forEach(item => item.fill(0));
  return result;
}
function parseResponseBody(body: Uint8Array, auth: TrustedM5ProviderSmokeAuthorization, config: M5ProviderSmokeConfig, receivedAt: string): Readonly<{ recordCount: number; fingerprint: string; capabilityOutcomes?: readonly ("OBSERVED" | "UNKNOWN")[] }> {
  try {
    const parsed = parseM5LiveCoinGeckoResponse({ body, coinId: config.coinId!, contractAddress: config.contractAddress, datasetVersion: auth.datasetVersion, retrievedAt: receivedAt });
    return { recordCount: parsed.daily.length, fingerprint: parsed.payloadFingerprint, capabilityOutcomes: [
      parsed.daily.length && parsed.daily.some(row => row.price.valueAtoms > 0n) ? "OBSERVED" : "UNKNOWN",
      parsed.daily.some(row => row.marketCap !== undefined) ? "OBSERVED" : "UNKNOWN",
      parsed.daily.some(row => row.volume !== undefined) ? "OBSERVED" : "UNKNOWN",
    ] };
  } finally { body.fill(0); }
}
async function parseProviderResponse(response: M5ProviderHttpTransportResponse, auth: TrustedM5ProviderSmokeAuthorization, config: M5ProviderSmokeConfig): Promise<Readonly<{ receivedAt: string; recordCount: number; fingerprint: string; capabilityOutcomes?: readonly ("OBSERVED" | "UNKNOWN")[] }>> {
  try {
    validateResponseShape(response);
    if (response.status >= 300 && response.status < 400) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_REDIRECT_REJECTED");
    if (response.status < 200 || response.status >= 300) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_PROVIDER_HTTP_FAILED");
    if (!/application\/json(?:\s*;|$)/i.test(response.headers["content-type"] ?? "")) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_PROVIDER_RESPONSE_INVALID");
    const receivedAt = canonicalTime(response.retrievedAt, "M5_PROVIDER_SMOKE_RECEIPT_INVALID");
    const body = await boundedBody(response.body, auth.maximumResponseBytes);
    const parsed = parseResponseBody(body, auth, config, receivedAt);
    return { receivedAt, ...parsed };
  } finally {
    if (response?.body instanceof Uint8Array) response.body.fill(0);
  }
}

export async function executeM5ProviderLiveSmoke(input: M5ProviderSmokeDependencies & Readonly<{ authorization: unknown }>): Promise<M5ProviderSmokeSummary> {
  try { input = checkedDependencies(input); }
  catch { return summary("INVALID", "unknown", "unknown", "unknown", "M5_PROVIDER_SMOKE_DEPENDENCIES_INVALID"); }
  let config: M5ProviderSmokeConfig;
  try { config = parseM5ProviderSmokeConfig(input.config); }
  catch { return summary("INVALID", input.providerId, "unknown", "unknown", "M5_PROVIDER_SMOKE_CONFIG_INVALID"); }
  if (config.providerId === "etherscan" || input.providerId === "etherscan") {
    return summary("BLOCKED", "etherscan", "etherscan-contract-authority", "etherscan-api-v2/v1", "M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT");
  }
  let auth: TrustedM5ProviderSmokeAuthorization;
  try { auth = trusted(input); }
  catch (error) { const code = error instanceof Error ? error.message : "M5_PROVIDER_SMOKE_AUTHORIZATION_INVALID"; return summary(errorStatus(code), config.providerId, "unknown", "unknown", code); }
  let current: string;
  try { current = canonicalTime(input.currentTime(), "M5_PROVIDER_SMOKE_CLOCK_INVALID"); }
  catch { return summary("INFRASTRUCTURE_FAILURE", config.providerId, auth.datasetId, auth.datasetVersion, "M5_PROVIDER_SMOKE_CLOCK_INVALID"); }
  try {
    const asOf = canonicalTime(input.asOf, "M5_PROVIDER_SMOKE_AS_OF_INVALID");
    if (input.environment !== "LOCAL_SMOKE" || auth.environment !== "LOCAL_SMOKE" || input.providerId !== config.providerId || config.providerId !== auth.providerId || asOf > current || Date.parse(current) - Date.parse(asOf) > MAX_AS_OF_AGE_MS || current >= auth.expiresAt) throw new Error("M5_PROVIDER_SMOKE_SCOPE_INVALID");
  } catch (error) { const code = error instanceof Error ? error.message : "M5_PROVIDER_SMOKE_SCOPE_INVALID"; return summary(errorStatus(code), config.providerId, auth.datasetId, auth.datasetVersion, code); }
  if (input.transport.isCredentialUrlSafeForSmoke?.(auth.providerId) === false) {
    return summary("BLOCKED", auth.providerId, auth.datasetId, auth.datasetVersion, "M5_PROVIDER_SMOKE_CREDENTIAL_URL_POLICY_BLOCKED");
  }
  let requests: ReturnType<typeof makePlan>["requests"];
  try { requests = makePlan(config, auth).requests; }
  catch (error) { const code = error instanceof Error ? error.message : "M5_PROVIDER_SMOKE_PLAN_INVALID"; return summary(errorStatus(code), auth.providerId, auth.datasetId, auth.datasetVersion, code); }
  const reference = credentialReference(auth.providerId, auth.endpointProfile);
  const receipts: string[] = [];
  const fingerprints: string[] = [];
  const observations: { capability: string; outcome: "OBSERVED" | "UNKNOWN" }[] = auth.capabilities.map(capability => ({ capability, outcome: "UNKNOWN" }));
  let requestCount = 0;
  let parsedRecordCount = 0;
  try {
    for (const plan of requests) {
      if (++requestCount > auth.maximumRequests) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_REQUEST_BUDGET_EXCEEDED");
      const beforeLease = canonicalTime(input.currentTime(), "M5_PROVIDER_SMOKE_CLOCK_INVALID");
      if (beforeLease >= auth.expiresAt || beforeLease < auth.effectiveFrom) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
      if (!(await input.rateLimit.acquire({ providerId: auth.providerId, datasetId: auth.datasetId, credentialReference: reference.reference }))) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_RATE_LIMITED");
      const afterLease = canonicalTime(input.currentTime(), "M5_PROVIDER_SMOKE_CLOCK_INVALID");
      if (afterLease >= auth.expiresAt || afterLease < auth.effectiveFrom || afterLease < input.asOf || Date.parse(afterLease) - Date.parse(input.asOf) > MAX_AS_OF_AGE_MS) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
      let credential: M5EphemeralCredential;
      try { credential = await input.credentials.resolve(reference); validCredential(credential, reference); }
      catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_CREDENTIAL_UNAVAILABLE"); }
      const beforeHttp = canonicalTime(input.currentTime(), "M5_PROVIDER_SMOKE_CLOCK_INVALID");
      if (beforeHttp >= auth.expiresAt || beforeHttp < auth.effectiveFrom || beforeHttp < input.asOf || Date.parse(beforeHttp) - Date.parse(input.asOf) > MAX_AS_OF_AGE_MS) throw new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let response: M5ProviderHttpTransportResponse;
      try {
        const timed = new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new M5ProviderInfrastructureError("M5_PROVIDER_SMOKE_TIMEOUT")); }, 5_000); });
        response = await Promise.race([input.transport.send({ request: plan, credential, timeoutMs: 5_000, maxResponseBytes: auth.maximumResponseBytes, redirectPolicy: "ERROR", attemptOrdinal: 1, signal: controller.signal }), timed]);
      } catch (error) {
        const code = error instanceof M5ProviderInfrastructureError && error.code === "M5_PROVIDER_SMOKE_TIMEOUT" ? error.code : "M5_PROVIDER_SMOKE_TRANSPORT_FAILED";
        throw new M5ProviderInfrastructureError(code);
      } finally { if (timeout !== undefined) clearTimeout(timeout); }
      const parsed = await parseProviderResponse(response, auth, config);
      parsedRecordCount += parsed.recordCount;
      fingerprints.push(parsed.fingerprint);
      if (parsed.capabilityOutcomes !== undefined) {
        parsed.capabilityOutcomes.forEach((outcome, index) => { observations[index]!.outcome = outcome; });
      }
      receipts.push(parsed.receivedAt);
    }
    return summary("VERIFIED", auth.providerId, auth.datasetId, auth.datasetVersion, undefined, { requestCount, parsedRecordCount, responseTimestamps: [...receipts], receiptTimestamps: [...receipts], payloadFingerprints: [...fingerprints], capabilityObservations: observations });
  } catch (error) {
    // Provider/parser errors are converted to stable codes; raw bodies and error objects are discarded.
    const candidate = error instanceof M5ProviderInfrastructureError ? error.code : error instanceof Error ? error.message : "";
    const safe = SAFE_SMOKE_FAILURE_CODES.has(candidate) ? candidate : "M5_PROVIDER_SMOKE_PROVIDER_RESPONSE_INVALID";
    const status = safe === "M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED" ? "BLOCKED" : "INFRASTRUCTURE_FAILURE";
    return summary(status, auth.providerId, auth.datasetId, auth.datasetVersion, safe, { requestCount, parsedRecordCount, responseTimestamps: [...receipts], receiptTimestamps: [...receipts], payloadFingerprints: [...fingerprints], capabilityObservations: observations });
  }
}
