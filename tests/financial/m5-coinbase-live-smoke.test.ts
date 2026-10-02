import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { COINBASE_SMOKE_AUTHORITY_REGISTRIES, COINBASE_SMOKE_LIMITS, COINBASE_SMOKE_PROFILES, COINBASE_SMOKE_SCOPE, COINBASE_SMOKE_STATUS, COINBASE_SMOKE_VERSION, createCoinbaseSmokeAuthorization, isRuntimeCoinbaseSmokeAuthorization, parseCoinbaseSmokeAuthorization, planCoinbaseSmoke, validateCoinbaseSmokeRequest } from "@/application/intelligence/m5-coinbase-smoke-contract";
import { parseCoinbaseSmokeResponse } from "@/application/intelligence/m5-coinbase-smoke-parser";
import { executeCoinbaseSmoke } from "@/application/intelligence/m5-coinbase-live-smoke";
import { requestCoinbaseSmokeBatch, requestCoinbaseSmokeObservation, type CoinbaseSmokeHttpPorts } from "@/infrastructure/intelligence/m5-coinbase-smoke-http-boundary";
import { runCoinbaseSmokeCli } from "../../scripts/m5-coinbase-smoke";

const now = "2026-10-02T12:00:00.000Z";
const config = () => ({ ...COINBASE_SMOKE_SCOPE, start: "2026-09-30T00:00:00.000Z", end: "2026-10-02T00:00:00.000Z", granularity: 86400 });
const draft = () => ({ schemaVersion: COINBASE_SMOKE_VERSION, authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, profiles: COINBASE_SMOKE_PROFILES, limits: COINBASE_SMOKE_LIMITS, environment: "LOCAL_SMOKE", retention: "PROCESS_MEMORY_ONLY", reviewedAt: "2026-10-02T10:00:00.000Z", effectiveFrom: "2026-10-02T11:00:00.000Z", expiresAt: "2026-10-02T13:00:00.000Z", references: ["review:synthetic", "operator:synthetic"], recordedAt: now });
const request = (index = 0) => planCoinbaseSmoke(config()).requests[index]!;
const product = JSON.stringify({ id: "ETH-USD", base_currency: "ETH", quote_currency: "USD", display_name: "ETH/USD", status: "online", trading_disabled: false, post_only: false, status_message: "synthetic-private-canary" });
const first = Date.parse(config().start) / 1000;
const candle = (t = first, close = "2001.123456789012345678901234567890") => `[${t},2000,2002,2001,${close},0.123456789012345678901234567890]`;
const stats = '{"open":"2000","high":"2100","low":"1900","last":"2001","volume":"123.456789012345678901234567890","volume_30day":"999"}';
const encode = (text: string) => new TextEncoder().encode(text);
const parse = (text: string, index = 0, receivedAt = now) => parseCoinbaseSmokeResponse({ request: request(index), body: encode(text), receivedAt, evaluationAt: now });
function fakePorts(text = product) {
  const cancel = vi.fn();
  const response: Awaited<ReturnType<CoinbaseSmokeHttpPorts["open"]>> = { status: 200, contentType: "application/json; charset=utf-8", contentEncoding: null, body: (async function* () { yield encode(text); })(), cancel };
  const ports = {
    acquireLease: vi.fn(async () => true),
    resolveIpv4: vi.fn(async () => ["8.8.8.8"]),
    open: vi.fn<CoinbaseSmokeHttpPorts["open"]>(async () => response),
    currentTime: vi.fn(() => now),
  } satisfies CoinbaseSmokeHttpPorts;
  return { ports, cancel, response };
}
afterEach(() => vi.useRealTimers());

describe("Coinbase descriptive smoke authorization and request plan", () => {
  it("has deterministic full fingerprint, sorted references, receipt-independent recordedAt and deep freeze", () => {
    const a = createCoinbaseSmokeAuthorization(draft());
    const b = createCoinbaseSmokeAuthorization({ ...draft(), references: [...draft().references].reverse(), recordedAt: "2026-10-02T12:01:00.000Z" });
    expect(a.fingerprint).toBe(b.fingerprint); expect(a.authorizationId).toBe(b.authorizationId);
    expect(a).toEqual(parseCoinbaseSmokeAuthorization(JSON.parse(JSON.stringify(a))));
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.profiles[1].queryFields)).toBe(true);
    const c = createCoinbaseSmokeAuthorization({ ...draft(), expiresAt: "2026-10-02T13:01:00.000Z" });
    expect(c.fingerprint).not.toBe(a.fingerprint);
    expect(() => Reflect.set(a.scope, "instrument", "BTC-USD")).not.toThrow(); expect(a.scope.instrument).toBe("ETH-USD");
  });
  it.each(["instrument", "baseAsset", "quoteAsset", "hostname", "provider", "venue"])("rejects wrong exact scope %s", key => {
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), scope: { ...COINBASE_SMOKE_SCOPE, [key]: "other" } })).toThrow("SCOPE_INVALID");
    expect(() => planCoinbaseSmoke({ ...config(), [key]: "other" })).toThrow("SCOPE_INVALID");
  });
  it.each(["maximumRequests", "maximumRequestsPerProfile", "maximumPages", "maximumResponseBytes", "maximumTotalResponseBytes", "timeoutMs", "retries", "retryAfterWaitMs", "maximumDailyBuckets"])("pins budget %s", key => {
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), limits: { ...COINBASE_SMOKE_LIMITS, [key]: Number.MAX_SAFE_INTEGER } })).toThrow("LIMITS_INVALID");
  });
  it.each(["fingerprint", "authorizationId"])("rejects forged identity %s", key => {
    const auth = createCoinbaseSmokeAuthorization(draft());
    expect(() => parseCoinbaseSmokeAuthorization({ ...auth, [key]: "https://secret.invalid/token" })).toThrow("FINGERPRINT_INVALID");
  });
  it.each(["2026-02-30T12:00:00.000Z", "2026-10-02T12:00:00Z", "2026-10-02T12:00:00.000+00:00", "invalid"])("rejects noncanonical time %s", time => {
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), reviewedAt: time })).toThrow("TIME_INVALID");
  });
  it("rejects duplicates, secret/URL references, profile paths, capability escalation and credential configuration", () => {
    for (const references of [["review:a", "review:a"], ["review:secret-key", "operator:test"], ["https://example.com", "operator:test"]]) expect(() => createCoinbaseSmokeAuthorization({ ...draft(), references })).toThrow("REFERENCE_INVALID");
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), profiles: [COINBASE_SMOKE_PROFILES[0], COINBASE_SMOKE_PROFILES[0], COINBASE_SMOKE_PROFILES[2]] })).toThrow("PROFILE_INVALID");
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), profiles: [{ ...COINBASE_SMOKE_PROFILES[0], capabilities: ["READY"] }, ...COINBASE_SMOKE_PROFILES.slice(1)] })).toThrow("PROFILE_INVALID");
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), credentials: [] })).toThrow("SHAPE_INVALID");
  });
  it("rejects proxies at every authority nesting level without invoking traps or getters", () => {
    const trap = vi.fn(() => { throw new Error("private-canary"); });
    const proxy = new Proxy({}, { get: trap, getPrototypeOf: trap, ownKeys: trap, getOwnPropertyDescriptor: trap });
    expect(() => createCoinbaseSmokeAuthorization(proxy)).toThrow("SHAPE_INVALID");
    for (const field of ["scope", "profiles", "limits", "references"]) expect(() => createCoinbaseSmokeAuthorization({ ...draft(), [field]: proxy })).toThrow("SHAPE_INVALID");
    expect(trap).not.toHaveBeenCalled();
    const getter = vi.fn(); const unsafe = Object.defineProperty({ ...draft() }, "scope", { get: getter, enumerable: true });
    expect(() => createCoinbaseSmokeAuthorization(unsafe)).toThrow("SHAPE_INVALID"); expect(getter).not.toHaveBeenCalled();
    const nested = Object.defineProperty({}, "bad", { get: getter, enumerable: true });
    expect(() => createCoinbaseSmokeAuthorization({ ...draft(), profiles: [{ ...COINBASE_SMOKE_PROFILES[0], capabilities: [nested] }, ...COINBASE_SMOKE_PROFILES.slice(1)] })).toThrow("PROFILE_INVALID"); expect(getter).not.toHaveBeenCalled();
  });
  it("rejects inherited, symbol, non-plain, sparse and accessor array shapes", () => {
    for (const value of [Object.assign(Object.create({ inherited: true }), draft()), { ...draft(), [Symbol()]: true }, new Date(), { ...draft(), references: [,"operator:x"] }, { ...draft(), scope: Object.assign(Object.create({ x: 1 }), COINBASE_SMOKE_SCOPE) }]) expect(() => createCoinbaseSmokeAuthorization(value)).toThrow("SHAPE_INVALID");
  });
  it("plans exactly three requests and local two-bucket budget without credentials", () => {
    const plan = planCoinbaseSmoke(config()); expect(plan.requests).toHaveLength(3); expect(plan.credentialReferences).toEqual([]);
    expect(plan.requests[1].query).toEqual([{ key: "end", value: config().end }, { key: "granularity", value: "86400" }, { key: "start", value: config().start }]);
    expect(plan.limits.maximumTotalResponseBytes).toBe(1572864); expect(plan.productionStatus).toBe("BLOCKED_BACKEND_UNAPPROVED");
    for (const row of plan.requests) expect(validateCoinbaseSmokeRequest(row)).toEqual(row);
  });
  it.each([
    { end: config().start }, { start: config().end }, { end: "2026-10-03T00:00:00.000Z" }, { start: "2026-09-30T01:00:00.000Z" }, { granularity: 60 }, { unknown: "x" }, { start: undefined },
  ])("rejects unsafe range/query %j", patch => expect(() => planCoinbaseSmoke({ ...config(), ...patch })).toThrow());
  it.each([
    { hostname: "api.exchange.coinbase.com.evil.invalid" }, { hostname: "127.0.0.1" }, { protocol: "http:" }, { method: "POST" }, { path: "/products/ETH-USD/../BTC-USD" }, { path: "/products/%45TH-USD" }, { query: [{ key: "apikey", value: "canary" }] },
  ])("rejects request allowlist violation %j", patch => expect(() => validateCoinbaseSmokeRequest({ ...request(), ...patch })).toThrow());
});

describe("Coinbase sanitized lossless observations", () => {
  it("observes product identity/availability only, stripping private status message", () => {
    const result = parse(product); expect(result.product?.availability.trading_disabled).toBe(false);
    expect(result.authorityStatus).toBe(COINBASE_SMOKE_STATUS); expect(result.providerTimestamp).toBeNull();
    expect(JSON.stringify(result)).not.toContain("synthetic-private-canary"); expect(result.product?.id).toBe("ETH-USD");
  });
  it.each(["id", "base_currency", "quote_currency", "display_name", "status"])("rejects product mismatch %s", field => {
    expect(() => parse(JSON.stringify({ ...JSON.parse(product), [field]: "other" }))).toThrow("PRODUCT_IDENTITY_MISMATCH");
  });
  it("preserves exact numeric decimal lexemes and normalizes descending candle order", () => {
    const result = parse(`[${candle(first + 86400)},${candle()}]`, 1);
    expect(result.candles.map(item => item.bucketStart)).toEqual([config().start, "2026-10-01T00:00:00.000Z"]);
    expect(result.candles[0].close.decimal).toBe("2001.12345678901234567890123456789");
    expect(result.candles[0].volume).toEqual({ coefficient: "12345678901234567890123456789", scale: 29, decimal: "0.12345678901234567890123456789" });
    expect(Object.isFrozen(result.candles[0].close)).toBe(true);
    expect(result.capabilityObservations.every(c => c.outcome === "OBSERVED_FIELD_ONLY")).toBe(true);
  });
  it("handles exact exponent expansion without rounding", () => {
    expect(parse(`[${candle(first, "2.0011234567890123456789e3")}]`, 1).candles[0].close.decimal).toBe("2001.1234567890123456789");
    expect(parse(`[[${first},2e3,2.1e3,2000,2001,0e2]]`, 1).candles[0].volume.decimal).toBe("0");
  });
  it.each([
    "[[1,2,3]]", `[${candle()},${candle()}]`, `[${candle()},${candle(first + 60)}]`, `[${candle()},${candle(first + 86400)},${candle(first + 172800)}]`, `[${candle(first - 86400)}]`, `[${candle(first + 172800)}]`, `[[${first},2100,2000,2001,2001,1]]`, `[[${first},0,2000,1,1,1]]`, `[[${first},2000,2002,2001,"2001",1]]`, `[[${first},2000,2002,2001,2001,-1]]`, `[[${first}.5,2000,2002,2001,2001,1]]`, `[${candle(first, "1e999")}]`,
  ])("rejects malformed/out-of-budget/order/OHLC candles %s", source => expect(() => parse(source, 1)).toThrow("M5_COINBASE_SMOKE_"));
  it("accepts missing candles as unknown history and does not assert gap-free/finalized UTC-close", () => {
    const empty = parse("[]", 1); expect(empty.candleCount).toBe(0); expect(empty.capabilityObservations).toEqual([]);
    const single = parse(`[${candle()}]`, 1); expect(single.candleCount).toBe(1); expect(JSON.stringify(single)).not.toContain("READY");
  });
  it("observes stats field presence without qualifying rolling 24h or retaining decimals", () => {
    const result = parse(stats, 2); expect(result.statsFieldsPresent).toContain("volume"); expect(result.statsFieldsPresent).toContain("volume_30day");
    expect(result.capabilityObservations).toEqual([{ capability: "STATS_FIELD_PRESENCE", outcome: "OBSERVED_FIELD_ONLY" }]);
    expect(JSON.stringify(result)).not.toContain("123.456789"); expect(result.providerTimestamp).toBeNull();
  });
  it("payload identity ignores receipt while observation provenance binds receipt/evaluation", () => {
    const a = parse(product), b = parse(product, 0, "2026-10-02T11:59:59.000Z");
    expect(a.payloadFingerprint).toBe(b.payloadFingerprint); expect(a.observationFingerprint).not.toBe(b.observationFingerprint);
    expect(parse(product.replace("online", "offline")).payloadFingerprint).not.toBe(a.payloadFingerprint);
    expect(() => parse(product, 0, "2026-10-02T12:01:00.000Z")).toThrow("RECEIPT_INVALID");
  });
  it.each(["{} trailing", "{\"id\":1,\"id\":2}", "{\"id\":\"\\ud800\"}", "[01]", "[NaN]", "{", "\ufeff{}"])("rejects invalid JSON %s", source => expect(() => parse(source)).toThrow("JSON_INVALID"));
  it("rejects invalid UTF8 and oversized body without exposing raw text", () => {
    expect(() => parseCoinbaseSmokeResponse({ request: request(), body: new Uint8Array([0xc3, 0x28]), receivedAt: now, evaluationAt: now })).toThrow("UTF8_INVALID");
    expect(() => parseCoinbaseSmokeResponse({ request: request(), body: new Uint8Array(524289), receivedAt: now, evaluationAt: now })).toThrow("BODY_INVALID");
    expect(() => parse('{"secret-canary":true}')).toThrow("SHAPE_INVALID");
  });
});

describe("credential-free bounded transport boundary with fake ports only", () => {
  it("runs exactly one request per profile sequentially, bounding total bytes with fake ports", async () => {
    const { ports, response } = fakePorts();
    let active = 0, maxActive = 0;
    ports.open.mockImplementation(async options => {
      active++; maxActive = Math.max(maxActive, active);
      const text = options.request.profile === "PRODUCT_IDENTITY" ? product : options.request.profile === "DAILY_CANDLES" ? `[${candle()}]` : stats;
      return { ...response, body: (async function* () { yield encode(text); active--; })() };
    });
    const result = await requestCoinbaseSmokeBatch(planCoinbaseSmoke(config()), ports);
    expect(result.requestCount).toBe(3); expect(maxActive).toBe(1);
    expect(ports.acquireLease).toHaveBeenCalledTimes(3); expect(ports.resolveIpv4).toHaveBeenCalledTimes(3); expect(ports.open).toHaveBeenCalledTimes(3);
    expect(result.totalResponseBytes).toBe(result.observations.reduce((sum, item) => sum + item.responseByteLength, 0));
    expect(result.totalResponseBytes).toBeLessThanOrEqual(COINBASE_SMOKE_LIMITS.maximumTotalResponseBytes);
    expect(result.observations.map(item => item.endpointProfile)).toEqual(COINBASE_SMOKE_PROFILES.map(item => item.profile));
    const plan = planCoinbaseSmoke(config());
    ports.acquireLease.mockClear();
    await expect(requestCoinbaseSmokeBatch({ ...plan }, ports)).rejects.toThrow("PLAN_NOT_RUNTIME_TRUSTED");
    await expect(requestCoinbaseSmokeBatch({ ...plan, requests: [request(), request()] }, ports)).rejects.toThrow("PLAN_NOT_RUNTIME_TRUSTED");
    expect(ports.acquireLease).not.toHaveBeenCalled();
  });
  it("takes a lease, pins public DNS, fixes TLS host/GET/headers/no redirects and sanitizes output", async () => {
    const { ports, cancel } = fakePorts(); const result = await requestCoinbaseSmokeObservation({ request: request() }, ports);
    expect(ports.acquireLease).toHaveBeenCalledOnce(); expect(ports.resolveIpv4).toHaveBeenCalledOnce(); expect(ports.open).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
    const options = ports.open.mock.calls[0]![0]; expect(options.pinnedAddress).toBe("8.8.8.8"); expect(options.tlsServername).toBe("api.exchange.coinbase.com"); expect(options.redirectPolicy).toBe("ERROR");
    expect(options.headers).toEqual({ accept: "application/json", "accept-encoding": "identity" }); expect(options.signal.aborted).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/synthetic-private-canary|headers|cookies|credential|rawPayload/);
  });
  it.each(["Authorization", "CB-ACCESS-KEY", "CB-ACCESS-SIGN", "CB-ACCESS-TIMESTAMP", "CB-ACCESS-PASSPHRASE", "cookie", "x-api-key"])("rejects injected header %s before lease/DNS/HTTP", async header => {
    const { ports } = fakePorts(); await expect(requestCoinbaseSmokeObservation({ request: request(), headers: { [header]: "secret-canary" } }, ports)).rejects.toThrow("SHAPE_INVALID");
    expect(ports.acquireLease).not.toHaveBeenCalled(); expect(ports.resolveIpv4).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled();
  });
  it.each(["credential", "credentials", "credentialReferences", "environment", "retry", "signal"])("rejects extra transport field %s before any port", async key => {
    const { ports } = fakePorts(); await expect(requestCoinbaseSmokeObservation({ request: request(), [key]: "secret-canary" }, ports)).rejects.toThrow("SHAPE_INVALID"); expect(ports.acquireLease).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "8.8.8.8.evil", "008.8.8.8", "198.18.0.1"])("rejects SSRF address %s before HTTP", async address => {
    const { ports } = fakePorts(); ports.resolveIpv4.mockResolvedValue([address]);
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("DNS_REJECTED"); expect(ports.open).not.toHaveBeenCalled();
  });
  it("rejects a mixed DNS set and denied local lease", async () => {
    const { ports } = fakePorts(); ports.resolveIpv4.mockResolvedValue(["8.8.8.8", "127.0.0.1"]);
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("DNS_REJECTED");
    ports.acquireLease.mockResolvedValue(false); await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("RATE_LEASE_DENIED"); expect(ports.resolveIpv4).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: 301, code: "REDIRECT_REJECTED" }, { status: 429, code: "HTTP_REJECTED" }, { contentType: "text/html", code: "CONTENT_TYPE_REJECTED" }, { contentType: "application/json; charset=latin1", code: "CONTENT_TYPE_REJECTED" }, { contentEncoding: "gzip", code: "CONTENT_ENCODING_REJECTED" },
  ])("rejects transport response %j with cancellation/no retries", async patch => {
    const { ports, cancel, response } = fakePorts();
    ports.open.mockImplementation(async () => ({ ...response, ...patch }));
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow(patch.code); expect(ports.open).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
  });
  it("bounds streaming and snapshots chunks to prevent aliases", async () => {
    const { ports, response } = fakePorts();
    ports.open.mockImplementation(async () => ({ ...response, body: (async function* () { yield new Uint8Array(524288); yield new Uint8Array(1); })() }));
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("RESPONSE_TOO_LARGE");
    const bytes = encode(product);
    ports.open.mockImplementation(async () => ({ ...response, body: (async function* () { yield bytes; bytes.fill(0); })() }));
    expect((await requestCoinbaseSmokeObservation({ request: request() }, ports)).product?.id).toBe("ETH-USD");
  });
  it("times out a hung port, aborts, and does not retry", async () => {
    vi.useFakeTimers(); const { ports } = fakePorts(); ports.resolveIpv4.mockImplementation(() => new Promise(() => {}));
    const result = requestCoinbaseSmokeObservation({ request: request() }, ports);
    const rejected = expect(result).rejects.toThrow("TIMEOUT"); await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(ports.acquireLease).toHaveBeenCalledOnce(); expect(ports.resolveIpv4).toHaveBeenCalledOnce(); expect(ports.open).not.toHaveBeenCalled();
  });
  it("never exposes opaque transport errors or raw response failures", async () => {
    const { ports } = fakePorts(); ports.open.mockRejectedValue(new Error("Authorization=secret-canary/raw-response"));
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_TRANSPORT_FAILED$/);
  });
  it("sanitizes an initial clock failure before taking a lease", async () => {
    const { ports } = fakePorts(); ports.currentTime.mockImplementation(() => { throw new Error("private-clock-canary"); });
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_TRANSPORT_FAILED$/);
    expect(ports.acquireLease).not.toHaveBeenCalled();
  });
  it.each(["lease", "open", "body"])("times out %s, stops follow-up phases and cleans up", async phase => {
    vi.useFakeTimers(); const { ports, response, cancel } = fakePorts();
    if (phase === "lease") ports.acquireLease.mockImplementation(() => new Promise(() => {}));
    if (phase === "open") ports.open.mockImplementation(() => new Promise(() => {}));
    if (phase === "body") ports.open.mockImplementation(async () => ({ ...response, body: (async function* () { await new Promise(() => {}); yield encode(product); })() }));
    const rejected = expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("TIMEOUT");
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    expect(ports.acquireLease).toHaveBeenCalledOnce();
    if (phase === "lease") { expect(ports.resolveIpv4).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled(); }
    if (phase === "body") expect(cancel).toHaveBeenCalledOnce();
  });
  it("accepts three responses at the exact aggregate byte ceiling", async () => {
    const { ports, response } = fakePorts();
    ports.open.mockImplementation(async options => {
      const json = options.request.profile === "PRODUCT_IDENTITY" ? product : options.request.profile === "DAILY_CANDLES" ? "[]" : stats;
      const padded = encode(json + " ".repeat(COINBASE_SMOKE_LIMITS.maximumResponseBytes - encode(json).byteLength));
      return { ...response, body: (async function* () { yield padded; })() };
    });
    const result = await requestCoinbaseSmokeBatch(planCoinbaseSmoke(config()), ports);
    expect(result.requestCount).toBe(3); expect(result.totalResponseBytes).toBe(COINBASE_SMOKE_LIMITS.maximumTotalResponseBytes);
  });
});

describe("empty registry and side-effect-free CLI", () => {
  it("rejects copies/serialization/clones/lookalikes as runtime trust", () => {
    const auth = createCoinbaseSmokeAuthorization(draft()); expect(isRuntimeCoinbaseSmokeAuthorization(auth)).toBe(true);
    for (const copied of [{ ...auth }, JSON.parse(JSON.stringify(auth)), structuredClone(auth), {}, new Proxy(auth, {})]) {
      expect(isRuntimeCoinbaseSmokeAuthorization(copied)).toBe(false);
      expect(() => executeCoinbaseSmoke({ config: config(), authorization: copied, environment: "LOCAL_SMOKE", evaluationAt: now })).toThrow("AUTHORITY_NOT_RUNTIME_TRUSTED");
    }
  });
  it("blocks genuine parsed contracts before any possible infrastructure operation", () => {
    expect(COINBASE_SMOKE_AUTHORITY_REGISTRIES).toEqual({ LOCAL_SMOKE: [], PRODUCTION: [] });
    const result = executeCoinbaseSmoke({ config: config(), authorization: createCoinbaseSmokeAuthorization(draft()), environment: "LOCAL_SMOKE", evaluationAt: now });
    expect(result).toMatchObject({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", requestCount: 0, productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
    expect(() => executeCoinbaseSmoke({ config: config(), authorization: createCoinbaseSmokeAuthorization(draft()), environment: "PRODUCTION", evaluationAt: now })).toThrow("ENVIRONMENT_INVALID");
    expect(() => executeCoinbaseSmoke({ config: config(), authorization: createCoinbaseSmokeAuthorization(draft()), environment: "LOCAL_SMOKE", evaluationAt: "2026-10-02T13:00:00.000Z" })).toThrow("AUTHORITY_EXPIRED");
  });
  it("dry-runs with no injected ports, file, environment, DNS, HTTP or persistence operations", () => {
    const args = ["--start", config().start, "--end", config().end];
    expect(runCoinbaseSmokeCli(args)).toMatchObject({ mode: "DRY_RUN", credentialReferences: [], productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
    expect(runCoinbaseSmokeCli([...args, "--execute", "--environment", "LOCAL_SMOKE", "--authorization", "review:future-smoke"])).toMatchObject({ status: "BLOCKED", requestCount: 0 });
    expect(() => runCoinbaseSmokeCli([...args, "--execute"])).toThrow("ARGUMENT_INVALID");
    expect(() => runCoinbaseSmokeCli([...args, "--headers", "Authorization=x"])).toThrow("ARGUMENT_INVALID");
  });
  it("has no credential/environment/persistence or real HTTP/DNS wiring and leaves production qualifications partial/blocked", () => {
    for (const file of ["scripts/m5-coinbase-smoke.ts", "src/application/intelligence/m5-coinbase-smoke-contract.ts", "src/application/intelligence/m5-coinbase-smoke-parser.ts", "src/application/intelligence/m5-coinbase-live-smoke.ts", "src/infrastructure/intelligence/m5-coinbase-smoke-http-boundary.ts"]) {
      const source = readFileSync(file, "utf8"); expect(source).not.toMatch(/process\.env|node:dns|node:https|fetch\(|from .*postgres|from .*repository|from .*uow|CredentialResolver/);
    }
    for (const file of ["config/m5/named-venue-daily-close-source-qualification.production.json", "config/m5/declared-venue-set-rolling-24h-volume-source-qualification.production.json"]) {
      const source = readFileSync(file, "utf8"); expect(source).not.toMatch(/"READY"/); expect(source).toMatch(/PARTIAL|BLOCKED/);
    }
  });
});
