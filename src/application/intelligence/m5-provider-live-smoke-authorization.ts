import { canonicalSha256, normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";

export const M5_PROVIDER_LIVE_SMOKE_AUTHORIZATION_VERSION = "m5-provider-live-smoke-authorization/v1" as const;
export const M5_PROVIDER_LIVE_SMOKE_CAPABILITIES = {
  coingecko: ["DAILY_CLOSE_SERIES", "MARKET_CAP", "VOLUME_24H"],
  etherscan: ["CONTRACT_VERIFICATION"],
} as const;
const FORBIDDEN = ["RAW_PAYLOAD_STORAGE", "NORMALIZED_STORAGE", "AUTHORITY_PERSISTENCE", "REDISTRIBUTION", "COMMERCIAL_USE"] as const;
const RETENTION = "PROCESS_MEMORY_ONLY" as const;
const MAX_REQUESTS = 2;
const MAX_PAGES = 1;
const MAX_RESPONSE_BYTES = 512_000;

export type M5ProviderSmokeAuthorization = Readonly<{
  schemaVersion: typeof M5_PROVIDER_LIVE_SMOKE_AUTHORIZATION_VERSION;
  authorizationId: string;
  fingerprint: string;
  environment: "LOCAL_SMOKE";
  providerId: "coingecko" | "etherscan";
  datasetId: string;
  datasetVersion: string;
  endpointProfile: "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_DEMO" | "ETHERSCAN_V2_ETHEREUM_CREATION_AND_SOURCE";
  capabilities: readonly string[];
  usages: readonly ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"];
  forbiddenUsages: typeof FORBIDDEN;
  retention: typeof RETENTION;
  effectiveFrom: string;
  expiresAt: string;
  maximumRequests: number;
  maximumPages: number;
  maximumResponseBytes: number;
  operatorReference: string;
  reviewReference: string;
  recordedAt: string;
}>;

export type M5ProviderSmokeAuthorizationRegistryEntry = Readonly<{ authorizationId: string; fingerprint: string }>;
export type TrustedM5ProviderSmokeAuthorization = M5ProviderSmokeAuthorization & { readonly __trustedSmokeAuthorization: unique symbol };

const trusted = new WeakSet<object>();
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
function text(value: unknown, code: string, max = 160): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(code);
  return value;
}
function time(value: unknown, code: string): string {
  const source = text(value, code, 40);
  if (normalizeIngestionTimestamp(source, code) !== source) throw new Error(code);
  return source;
}
function integer(value: unknown, code: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(code);
  return value as number;
}
function reference(value: unknown): string {
  const parsed = text(value, "M5_PROVIDER_SMOKE_AUTHORIZATION_REFERENCE_INVALID", 96);
  if (!/^(?:operator|review|ticket|change):[A-Za-z0-9._-]{1,80}$/.test(parsed)) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_REFERENCE_INVALID");
  return parsed;
}
const material = (auth: Omit<M5ProviderSmokeAuthorization, "fingerprint" | "recordedAt">) => ({
  schemaVersion: auth.schemaVersion, authorizationId: auth.authorizationId, environment: auth.environment,
  providerId: auth.providerId, datasetId: auth.datasetId, datasetVersion: auth.datasetVersion,
  endpointProfile: auth.endpointProfile, capabilities: auth.capabilities, usages: auth.usages,
  forbiddenUsages: auth.forbiddenUsages, retention: auth.retention, effectiveFrom: auth.effectiveFrom,
  expiresAt: auth.expiresAt, maximumRequests: auth.maximumRequests, maximumPages: auth.maximumPages,
  maximumResponseBytes: auth.maximumResponseBytes, operatorReference: auth.operatorReference,
  reviewReference: auth.reviewReference,
});
const identitySeed = (auth: Omit<M5ProviderSmokeAuthorization, "fingerprint" | "recordedAt">) => {
  const identity = material(auth) as Record<string, unknown>;
  delete identity.authorizationId;
  return identity;
};
function strictArray(value: unknown, code: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) throw new Error(code);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(code);
  }
  return value;
}

export function parseM5ProviderSmokeAuthorization(value: unknown): M5ProviderSmokeAuthorization {
  const root = record(value, ["schemaVersion", "authorizationId", "fingerprint", "environment", "providerId", "datasetId", "datasetVersion", "endpointProfile", "capabilities", "usages", "forbiddenUsages", "retention", "effectiveFrom", "expiresAt", "maximumRequests", "maximumPages", "maximumResponseBytes", "operatorReference", "reviewReference", "recordedAt"], ["schemaVersion", "authorizationId", "fingerprint", "environment", "providerId", "datasetId", "datasetVersion", "endpointProfile", "capabilities", "usages", "forbiddenUsages", "retention", "effectiveFrom", "expiresAt", "maximumRequests", "maximumPages", "maximumResponseBytes", "operatorReference", "reviewReference", "recordedAt"], "M5_PROVIDER_SMOKE_AUTHORIZATION_INVALID");
  if (root.schemaVersion !== M5_PROVIDER_LIVE_SMOKE_AUTHORIZATION_VERSION || root.environment !== "LOCAL_SMOKE" || (root.providerId !== "coingecko" && root.providerId !== "etherscan")) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_INVALID");
  const providerId = root.providerId;
  const expected = providerId === "coingecko"
    ? { datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", endpointProfile: "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_DEMO" }
    : { datasetId: "etherscan-contract-authority", datasetVersion: "etherscan-api-v2/v1", endpointProfile: "ETHERSCAN_V2_ETHEREUM_CREATION_AND_SOURCE" };
  if (root.datasetId !== expected.datasetId || root.datasetVersion !== expected.datasetVersion || root.endpointProfile !== expected.endpointProfile) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_SCOPE_INVALID");
  const capabilities = strictArray(root.capabilities, "M5_PROVIDER_SMOKE_AUTHORIZATION_CAPABILITY_INVALID");
  const usages = strictArray(root.usages, "M5_PROVIDER_SMOKE_AUTHORIZATION_USAGE_INVALID");
  const forbiddenUsages = strictArray(root.forbiddenUsages, "M5_PROVIDER_SMOKE_AUTHORIZATION_USAGE_INVALID");
  if (capabilities.some((item, index) => item !== M5_PROVIDER_LIVE_SMOKE_CAPABILITIES[providerId][index]) || capabilities.length !== M5_PROVIDER_LIVE_SMOKE_CAPABILITIES[providerId].length) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_CAPABILITY_INVALID");
  if (usages.length !== 2 || usages[0] !== "NETWORK_ACQUISITION" || usages[1] !== "RAW_PAYLOAD_PROCESSING") throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_USAGE_INVALID");
  if (forbiddenUsages.length !== FORBIDDEN.length || forbiddenUsages.some((item, index) => item !== FORBIDDEN[index])) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_USAGE_INVALID");
  if (root.retention !== RETENTION) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_RETENTION_INVALID");
  const effectiveFrom = time(root.effectiveFrom, "M5_PROVIDER_SMOKE_AUTHORIZATION_TIME_INVALID");
  const expiresAt = time(root.expiresAt, "M5_PROVIDER_SMOKE_AUTHORIZATION_TIME_INVALID");
  const recordedAt = time(root.recordedAt, "M5_PROVIDER_SMOKE_AUTHORIZATION_TIME_INVALID");
  if (effectiveFrom >= expiresAt || recordedAt < effectiveFrom || recordedAt >= expiresAt) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_TIME_INVALID");
  const base: Omit<M5ProviderSmokeAuthorization, "fingerprint" | "recordedAt"> = {
    schemaVersion: M5_PROVIDER_LIVE_SMOKE_AUTHORIZATION_VERSION,
    authorizationId: text(root.authorizationId, "M5_PROVIDER_SMOKE_AUTHORIZATION_ID_INVALID", 120),
    environment: "LOCAL_SMOKE" as const, providerId,
    datasetId: expected.datasetId, datasetVersion: expected.datasetVersion,
    endpointProfile: expected.endpointProfile as M5ProviderSmokeAuthorization["endpointProfile"],
    capabilities: [...capabilities] as string[],
    usages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"] as const,
    forbiddenUsages: [...FORBIDDEN] as unknown as typeof FORBIDDEN,
    retention: RETENTION,
    effectiveFrom, expiresAt,
    maximumRequests: integer(root.maximumRequests, "M5_PROVIDER_SMOKE_AUTHORIZATION_BUDGET_INVALID", providerId === "coingecko" ? 1 : 2, providerId === "coingecko" ? 1 : MAX_REQUESTS),
    maximumPages: integer(root.maximumPages, "M5_PROVIDER_SMOKE_AUTHORIZATION_BUDGET_INVALID", 1, MAX_PAGES),
    maximumResponseBytes: integer(root.maximumResponseBytes, "M5_PROVIDER_SMOKE_AUTHORIZATION_BUDGET_INVALID", 1, MAX_RESPONSE_BYTES),
    operatorReference: reference(root.operatorReference),
    reviewReference: reference(root.reviewReference),
  };
  const fingerprint = canonicalSha256(material(base));
  const expectedId = `m5-smoke-${canonicalSha256(identitySeed(base)).slice(0, 24)}`;
  if (root.fingerprint !== fingerprint || root.authorizationId !== expectedId) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_FINGERPRINT_INVALID");
  return freeze({ ...base, fingerprint, recordedAt });
}

export function createM5ProviderSmokeAuthorization(input: Omit<M5ProviderSmokeAuthorization, "schemaVersion" | "authorizationId" | "fingerprint">): M5ProviderSmokeAuthorization {
  const base = { ...input, schemaVersion: M5_PROVIDER_LIVE_SMOKE_AUTHORIZATION_VERSION, authorizationId: "" } as Omit<M5ProviderSmokeAuthorization, "fingerprint" | "recordedAt">;
  const authorizationId = `m5-smoke-${canonicalSha256(identitySeed(base)).slice(0, 24)}`;
  const withId = { ...base, authorizationId } as Omit<M5ProviderSmokeAuthorization, "fingerprint" | "recordedAt">;
  const fingerprint = canonicalSha256(material(withId));
  return parseM5ProviderSmokeAuthorization({ ...withId, fingerprint, recordedAt: input.recordedAt });
}

export function isTrustedM5ProviderSmokeAuthorization(value: unknown): value is TrustedM5ProviderSmokeAuthorization {
  return !!value && typeof value === "object" && trusted.has(value as object);
}

export function resolveTrustedM5ProviderSmokeAuthorization(input: Readonly<{ authorization: unknown; registry: unknown; asOf: unknown }>): TrustedM5ProviderSmokeAuthorization {
  const auth = parseM5ProviderSmokeAuthorization(input.authorization);
  const rows = strictArray(input.registry, "M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY_INVALID");
  const entries = freeze(rows.map(item => {
    const row = record(item, ["authorizationId", "fingerprint"], ["authorizationId", "fingerprint"], "M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY_INVALID");
    return freeze({ authorizationId: text(row.authorizationId, "M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY_INVALID", 120), fingerprint: text(row.fingerprint, "M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY_INVALID", 64) });
  }));
  const ids = entries.map(item => item.authorizationId);
  const fingerprints = entries.map(item => item.fingerprint);
  if (new Set(ids).size !== ids.length || new Set(fingerprints).size !== fingerprints.length) throw new Error("M5_PROVIDER_SMOKE_AUTHORITY_CONFLICT");
  const entry = entries.find(item => item.authorizationId === auth.authorizationId && item.fingerprint === auth.fingerprint);
  if (!entry) throw new Error("M5_PROVIDER_SMOKE_AUTHORITY_NOT_TRUSTED");
  const asOf = time(input.asOf, "M5_PROVIDER_SMOKE_AS_OF_INVALID");
  if (asOf < auth.effectiveFrom || asOf < auth.recordedAt || asOf >= auth.expiresAt) throw new Error("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
  const resolved = parseM5ProviderSmokeAuthorization(auth);
  trusted.add(resolved);
  return resolved as TrustedM5ProviderSmokeAuthorization;
}

export const M5_PROVIDER_SMOKE_BUDGET_CAPS = freeze({ maximumRequests: MAX_REQUESTS, maximumPages: MAX_PAGES, maximumResponseBytes: MAX_RESPONSE_BYTES });
export const M5_PROVIDER_SMOKE_FORBIDDEN_USAGES = FORBIDDEN;
// Deliberately empty in this implementation slice. A later separately approved operation must
// add an exact ID/fingerprint pair through reviewed source control.
export const M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY: readonly M5ProviderSmokeAuthorizationRegistryEntry[] = freeze([]);
