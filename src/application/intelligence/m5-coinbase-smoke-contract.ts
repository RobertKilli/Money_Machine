import "server-only";
import { types } from "node:util";
import { createHash } from "node:crypto";

/** Only validated, owned material reaches this serializer. UTF-16 key order never uses locale. */
export function smokeSha256(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export const COINBASE_SMOKE_VERSION = "m5-coinbase-exchange-smoke-authorization/v1" as const;
export const COINBASE_SMOKE_STATUS = "NON_AUTHORITATIVE_MARKET_SMOKE" as const;
export const COINBASE_SMOKE_SCOPE = Object.freeze({ provider: "coinbase-exchange", venue: "Coinbase Exchange", instrument: "ETH-USD", baseAsset: "ETH", quoteAsset: "USD", hostname: "api.exchange.coinbase.com" } as const);
export const COINBASE_SMOKE_LIMITS = Object.freeze({ maximumRequests: 3, maximumRequestsPerProfile: 1, maximumPages: 1, maximumResponseBytes: 512 * 1024, maximumTotalResponseBytes: 3 * 512 * 1024, timeoutMs: 5_000, retries: 0, retryAfterWaitMs: 0, maximumDailyBuckets: 2, maximumProviderCandles: 300 } as const);
export const COINBASE_SMOKE_PROFILES = Object.freeze([
  Object.freeze({ profile: "PRODUCT_IDENTITY", path: "/products/ETH-USD", queryFields: Object.freeze([] as string[]), capabilities: Object.freeze(["PRODUCT_IDENTITY_FIELDS", "PRODUCT_STATUS_FIELDS"]) }),
  Object.freeze({ profile: "DAILY_CANDLES", path: "/products/ETH-USD/candles", queryFields: Object.freeze(["end", "granularity", "start"]), capabilities: Object.freeze(["DAILY_CANDLE_FIELDS", "CLOSE_FIELD_PRESENCE", "CANDLE_VOLUME_FIELD_PRESENCE"]) }),
  Object.freeze({ profile: "PRODUCT_STATS", path: "/products/ETH-USD/stats", queryFields: Object.freeze([] as string[]), capabilities: Object.freeze(["STATS_FIELD_PRESENCE"]) }),
] as const);
export type CoinbaseSmokeProfile = typeof COINBASE_SMOKE_PROFILES[number]["profile"];

const failures = new WeakMap<object, string>();
export function smokeFailure(code: string): Error {
  const error = new Error(`M5_COINBASE_SMOKE_${code}`);
  failures.set(error, code);
  return error;
}
export function smokeFailureCode(error: unknown): string | undefined {
  return error && typeof error === "object" ? failures.get(error) : undefined;
}
export function smokeError(code: string): never { throw smokeFailure(code); }
/** Descriptor-only inspection; reject proxies before any reflection or property access. */
export function smokeRecord(input: unknown, fields: readonly string[], required = fields): Record<string, unknown> {
  if (!input || typeof input !== "object" || types.isProxy(input) || Array.isArray(input)) return smokeError("SHAPE_INVALID");
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return smokeError("SHAPE_INVALID");
  const keys = Reflect.ownKeys(input);
  if (keys.some(key => typeof key !== "string" || !fields.includes(key)) || required.some(key => !keys.includes(key))) return smokeError("SHAPE_INVALID");
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) return smokeError("SHAPE_INVALID");
    result[key] = descriptor.value;
  }
  return result;
}
export function smokeArray(input: unknown, maximum = 100): unknown[] {
  if (!input || typeof input !== "object" || types.isProxy(input) || !Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) return smokeError("SHAPE_INVALID");
  const length = Object.getOwnPropertyDescriptor(input, "length")?.value;
  if (!Number.isSafeInteger(maximum) || maximum < 0 || maximum > 300 || !Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(input).length !== length + 1) return smokeError("SHAPE_INVALID");
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) return smokeError("SHAPE_INVALID");
    return descriptor.value;
  });
}
const byteLengthGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")!.get!;
/** Intrinsic typed-array slots, never caller byteLength/getters/iterator/species. Check before allocating. */
export function smokeByteSnapshot(input: unknown, maximum: number, code: string): Uint8Array {
  if (!input || typeof input !== "object" || types.isProxy(input) || !types.isUint8Array(input)) return smokeError(code);
  const length = byteLengthGetter.call(input) as number;
  if (!Number.isSafeInteger(maximum) || maximum < 0 || !Number.isSafeInteger(length) || length > maximum) return smokeError(code);
  const snapshot = new Uint8Array(length);
  Uint8Array.prototype.set.call(snapshot, input);
  return snapshot;
}
export function smokeFreeze<T>(input: T): T {
  if (input && typeof input === "object") {
    for (const value of Object.values(input)) smokeFreeze(value);
    Object.freeze(input);
  }
  return input;
}
export function smokeTime(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input) || !Number.isFinite(Date.parse(input)) || new Date(input).toISOString() !== input) return smokeError("TIME_INVALID");
  return input;
}
function reference(input: unknown): string {
  if (typeof input !== "string" || !/^(?:review|operator|change|ticket):[a-zA-Z0-9_-]{1,80}$/.test(input) || /secret|token|password|credential|https?|api[_-]?key|bearer/i.test(input)) return smokeError("REFERENCE_INVALID");
  return input;
}
export type CoinbaseSmokeAuthorization = Readonly<{
  schemaVersion: typeof COINBASE_SMOKE_VERSION;
  authorityStatus: typeof COINBASE_SMOKE_STATUS;
  authorizationId: string;
  fingerprint: string;
  scope: typeof COINBASE_SMOKE_SCOPE;
  profiles: typeof COINBASE_SMOKE_PROFILES;
  limits: typeof COINBASE_SMOKE_LIMITS;
  environment: "LOCAL_SMOKE";
  retention: "PROCESS_MEMORY_ONLY";
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  references: readonly string[];
  recordedAt: string;
}>;
type AuthorizationDraft = Omit<CoinbaseSmokeAuthorization, "authorizationId" | "fingerprint">;
const trusted = new WeakSet<object>();
const descriptions = new WeakSet<object>();
const trustedPlans = new WeakSet<object>();
// Neither environment has an operational authorization in this slice.
export const COINBASE_SMOKE_AUTHORITY_REGISTRIES = smokeFreeze({ LOCAL_SMOKE: [] as readonly Readonly<{ authorizationId: string; fingerprint: string }>[], PRODUCTION: [] as readonly Readonly<{ authorizationId: string; fingerprint: string }>[] });
function draft(input: unknown): AuthorizationDraft {
  const row = smokeRecord(input, ["schemaVersion", "authorityStatus", "scope", "profiles", "limits", "environment", "retention", "reviewedAt", "effectiveFrom", "expiresAt", "references", "recordedAt"]);
  if (row.schemaVersion !== COINBASE_SMOKE_VERSION || row.authorityStatus !== COINBASE_SMOKE_STATUS || row.environment !== "LOCAL_SMOKE" || row.retention !== "PROCESS_MEMORY_ONLY") return smokeError("AUTHORIZATION_INVALID");
  const scope = smokeRecord(row.scope, Object.keys(COINBASE_SMOKE_SCOPE));
  for (const key of Object.keys(COINBASE_SMOKE_SCOPE) as (keyof typeof COINBASE_SMOKE_SCOPE)[]) if (scope[key] !== COINBASE_SMOKE_SCOPE[key]) return smokeError("SCOPE_INVALID");
  const limits = smokeRecord(row.limits, Object.keys(COINBASE_SMOKE_LIMITS));
  for (const key of Object.keys(COINBASE_SMOKE_LIMITS) as (keyof typeof COINBASE_SMOKE_LIMITS)[]) if (limits[key] !== COINBASE_SMOKE_LIMITS[key]) return smokeError("LIMITS_INVALID");
  const profiles = smokeArray(row.profiles);
  if (profiles.length !== COINBASE_SMOKE_PROFILES.length) return smokeError("PROFILE_INVALID");
  profiles.forEach((value, index) => {
    const profile = smokeRecord(value, ["profile", "path", "queryFields", "capabilities"]);
    const expected = COINBASE_SMOKE_PROFILES[index]!;
    const queryFields = smokeArray(profile.queryFields), capabilities = smokeArray(profile.capabilities);
    if ([...queryFields, ...capabilities].some(value => typeof value !== "string") || profile.profile !== expected.profile || profile.path !== expected.path || smokeSha256(queryFields) !== smokeSha256(expected.queryFields) || smokeSha256(capabilities) !== smokeSha256(expected.capabilities)) return smokeError("PROFILE_INVALID");
  });
  const references = smokeArray(row.references).map(reference).sort();
  if (references.length < 2 || new Set(references).size !== references.length || !references.some(ref => ref.startsWith("review:")) || !references.some(ref => ref.startsWith("operator:"))) return smokeError("REFERENCE_INVALID");
  const reviewedAt = smokeTime(row.reviewedAt), effectiveFrom = smokeTime(row.effectiveFrom), expiresAt = smokeTime(row.expiresAt), recordedAt = smokeTime(row.recordedAt);
  if (reviewedAt > effectiveFrom || effectiveFrom >= expiresAt || recordedAt < reviewedAt) return smokeError("TIME_INVALID");
  return { schemaVersion: COINBASE_SMOKE_VERSION, authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, profiles: COINBASE_SMOKE_PROFILES, limits: COINBASE_SMOKE_LIMITS, environment: "LOCAL_SMOKE", retention: "PROCESS_MEMORY_ONLY", reviewedAt, effectiveFrom, expiresAt, references, recordedAt };
}
function identify(value: AuthorizationDraft) {
  const { recordedAt: _recordedAt, ...material } = value;
  void _recordedAt;
  const authorizationId = `coinbase-smoke-${smokeSha256(material)}`;
  return { authorizationId, fingerprint: smokeSha256({ ...material, authorizationId }) };
}
/** Descriptive parsing never issues operational runtime authority. */
export function parseCoinbaseSmokeAuthorization(input: unknown): CoinbaseSmokeAuthorization {
  const row = smokeRecord(input, ["schemaVersion", "authorityStatus", "authorizationId", "fingerprint", "scope", "profiles", "limits", "environment", "retention", "reviewedAt", "effectiveFrom", "expiresAt", "references", "recordedAt"]);
  const { authorizationId, fingerprint, ...fields } = row;
  const value = draft(fields), identity = identify(value);
  if (authorizationId !== identity.authorizationId || fingerprint !== identity.fingerprint) return smokeError("FINGERPRINT_INVALID");
  const result = smokeFreeze({ ...value, ...identity });
  descriptions.add(result);
  return result;
}
export function createCoinbaseSmokeAuthorization(input: unknown): CoinbaseSmokeAuthorization {
  const value = draft(input);
  return parseCoinbaseSmokeAuthorization({ ...value, ...identify(value) });
}
export function isRuntimeCoinbaseSmokeAuthorization(input: unknown): input is CoinbaseSmokeAuthorization {
  return !!input && typeof input === "object" && !types.isProxy(input) && trusted.has(input);
}
// Only this private registry resolver can issue operational trust. No issuer is exported.
function resolvePinnedAuthorization(input: unknown, asOf: string): CoinbaseSmokeAuthorization | undefined {
  if (!input || typeof input !== "object" || types.isProxy(input) || !descriptions.has(input)) return smokeError("AUTHORITY_NOT_RUNTIME_TRUSTED");
  const auth = input as CoinbaseSmokeAuthorization;
  if (asOf < auth.effectiveFrom || asOf < auth.reviewedAt || asOf >= auth.expiresAt) return smokeError("AUTHORITY_EXPIRED");
  if (!COINBASE_SMOKE_AUTHORITY_REGISTRIES.LOCAL_SMOKE.some(entry => entry.authorizationId === auth.authorizationId && entry.fingerprint === auth.fingerprint)) return undefined;
  const issued = smokeFreeze({ ...auth });
  trusted.add(issued);
  return issued;
}
/** Returns a gate decision only, never a trusted object or an arbitrary trust mutator. */
export function checkCoinbaseSmokeAuthorization(input: unknown, evaluationAt: unknown): boolean {
  const authority = resolvePinnedAuthorization(input, smokeTime(evaluationAt));
  return authority !== undefined && trusted.has(authority);
}

export type CoinbaseSmokeRequest = Readonly<{ protocol: "https:"; method: "GET"; hostname: string; profile: CoinbaseSmokeProfile; path: string; query: readonly Readonly<{ key: string; value: string }>[] }>;
export function planCoinbaseSmoke(input: unknown) {
  const fields = ["provider", "venue", "instrument", "baseAsset", "quoteAsset", "hostname", "start", "end", "granularity"];
  const row = smokeRecord(input, fields);
  for (const key of Object.keys(COINBASE_SMOKE_SCOPE) as (keyof typeof COINBASE_SMOKE_SCOPE)[]) if (row[key] !== COINBASE_SMOKE_SCOPE[key]) return smokeError("SCOPE_INVALID");
  const start = smokeTime(row.start), end = smokeTime(row.end);
  // Local smoke policy: explicit midnight UTC half-open range, at most two daily buckets.
  if (!start.endsWith("T00:00:00.000Z") || !end.endsWith("T00:00:00.000Z") || start >= end || Date.parse(end) - Date.parse(start) > 2 * 86_400_000 || row.granularity !== 86400) return smokeError("RANGE_INVALID");
  const expectedDailyBuckets = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  const requests: CoinbaseSmokeRequest[] = COINBASE_SMOKE_PROFILES.map(profile => ({ protocol: "https:", method: "GET", hostname: COINBASE_SMOKE_SCOPE.hostname, profile: profile.profile, path: profile.path, query: profile.profile === "DAILY_CANDLES" ? [{ key: "end", value: end }, { key: "granularity", value: "86400" }, { key: "start", value: start }] : [] }));
  const plan = smokeFreeze({ mode: "DRY_RUN", authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, start, end, expectedDailyBuckets, credentialReferences: [] as string[], headers: { accept: "application/json", "accept-encoding": "identity" }, limits: COINBASE_SMOKE_LIMITS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requests, fingerprint: smokeSha256({ scope: COINBASE_SMOKE_SCOPE, start, end, requests, limits: COINBASE_SMOKE_LIMITS }) });
  trustedPlans.add(plan);
  return plan;
}
export type CoinbaseSmokePlan = ReturnType<typeof planCoinbaseSmoke>;
export function isRuntimeCoinbaseSmokePlan(input: unknown): input is CoinbaseSmokePlan {
  return !!input && typeof input === "object" && !types.isProxy(input) && trustedPlans.has(input);
}
/** Also enforced at the transport boundary before rate lease or DNS. */
export function validateCoinbaseSmokeRequest(input: unknown): CoinbaseSmokeRequest {
  const row = smokeRecord(input, ["protocol", "method", "hostname", "profile", "path", "query"]);
  const expected = COINBASE_SMOKE_PROFILES.find(item => item.profile === row.profile);
  if (!expected || row.protocol !== "https:" || row.method !== "GET" || row.hostname !== COINBASE_SMOKE_SCOPE.hostname || row.path !== expected.path) return smokeError("REQUEST_INVALID");
  const query = smokeArray(row.query).map(value => {
    const item = smokeRecord(value, ["key", "value"]);
    if (typeof item.key !== "string" || typeof item.value !== "string") return smokeError("QUERY_INVALID");
    return { key: item.key, value: item.value };
  });
  if (smokeSha256(query.map(item => item.key)) !== smokeSha256(expected.queryFields)) return smokeError("QUERY_INVALID");
  if (expected.profile === "DAILY_CANDLES") {
    planCoinbaseSmoke({ ...COINBASE_SMOKE_SCOPE, start: query[2]!.value, end: query[0]!.value, granularity: query[1]!.value === "86400" ? 86400 : null });
  }
  return smokeFreeze({ protocol: "https:", method: "GET", hostname: COINBASE_SMOKE_SCOPE.hostname, profile: expected.profile, path: expected.path, query });
}
