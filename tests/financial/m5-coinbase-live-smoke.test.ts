import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeM5ProviderLiveSmoke } from "@/application/intelligence/m5-provider-live-smoke";
import { executeM5ProviderLiveAcquisition, isTrustedM5ProviderLiveAcquisitionForIngestion } from "@/application/intelligence/m5-provider-live-acquisition";
import { executeM5CoinGeckoAcquisitionIngestionHandoff } from "@/application/intelligence/m5-coingecko-acquisition-ingestion-handoff";
import { executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
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
  const cancel = vi.fn(), release = vi.fn();
  const response: Awaited<ReturnType<CoinbaseSmokeHttpPorts["open"]>> = { status: 200, contentType: "application/json; charset=utf-8", contentEncoding: null, body: (async function* () { yield encode(text); })(), cancel };
  const ports = {
    acquireLease: vi.fn<CoinbaseSmokeHttpPorts["acquireLease"]>(async () => ({ release })),
    resolveIpv4: vi.fn(async () => ["8.8.8.8"]),
    open: vi.fn<CoinbaseSmokeHttpPorts["open"]>(async () => response),
    currentTime: vi.fn(() => now),
  } satisfies CoinbaseSmokeHttpPorts;
  return { ports, cancel, response, release };
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
  it.each(["maximumRequests", "maximumRequestsPerProfile", "maximumPages", "maximumResponseBytes", "maximumTotalResponseBytes", "timeoutMs", "retries", "retryAfterWaitMs", "maximumDailyBuckets", "maximumProviderCandles"])("pins budget %s", key => {
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
    "[[1,2,3]]", `[${candle()},${candle()}]`, `[${candle()},${candle(first + 60)}]`, `[[${first},2100,2000,2001,2001,1]]`, `[[${first},0,2000,1,1,1]]`, `[[${first},2000,2002,2001,"2001",1]]`, `[[${first},2000,2002,2001,2001,-1]]`, `[[${first}.5,2000,2002,2001,2001,1]]`, `[${candle(first, "1e999")}]`,
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
  it.each(["Authorization", "Proxy-Authorization", "CB-ACCESS-KEY", "CB-ACCESS-SIGN", "CB-ACCESS-TIMESTAMP", "CB-ACCESS-PASSPHRASE", "cookie", "x-api-key"])("rejects injected header %s before lease/DNS/HTTP", async header => {
    const { ports } = fakePorts(); await expect(requestCoinbaseSmokeObservation({ request: request(), headers: { [header]: "secret-canary" } }, ports)).rejects.toThrow("SHAPE_INVALID");
    expect(ports.acquireLease).not.toHaveBeenCalled(); expect(ports.resolveIpv4).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled();
  });
  it.each(["credential", "credentials", "credentialReferences", "environment", "retry"])("rejects extra transport field %s before any port", async key => {
    const { ports } = fakePorts(); await expect(requestCoinbaseSmokeObservation({ request: request(), [key]: "secret-canary" }, ports)).rejects.toThrow("SHAPE_INVALID"); expect(ports.acquireLease).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "8.8.8.8.evil", "008.8.8.8", "198.18.0.1"])("rejects SSRF address %s before HTTP", async address => {
    const { ports } = fakePorts(); ports.resolveIpv4.mockResolvedValue([address]);
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("DNS_REJECTED"); expect(ports.open).not.toHaveBeenCalled();
  });
  it("rejects a mixed DNS set and denied local lease", async () => {
    const { ports } = fakePorts(); ports.resolveIpv4.mockResolvedValue(["8.8.8.8", "127.0.0.1"]);
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("DNS_REJECTED");
    ports.acquireLease.mockResolvedValue(null); await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("RATE_LEASE_DENIED"); expect(ports.resolveIpv4).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: 301, code: "REDIRECT_REJECTED" }, { status: 429, code: "HTTP_REJECTED" }, { contentType: "text/html", code: "CONTENT_TYPE_REJECTED" }, { contentType: "application/json; charset=latin1", code: "CONTENT_TYPE_REJECTED" }, { contentEncoding: "gzip", code: "CONTENT_ENCODING_REJECTED" },
  ])("rejects transport response %j with cancellation/no retries", async patch => {
    const { ports, cancel, response } = fakePorts();
    const { code, ...material } = patch;
    ports.open.mockImplementation(async () => ({ ...response, ...material }));
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow(code); expect(ports.open).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
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

describe("independent adversarial review regressions", () => {
  it("rejects unsafe cancellation prototypes/accessors without traps or port calls", async () => {
    const trap = vi.fn(() => { throw new Error("private-abort-canary"); });
    const prototype = new Proxy({}, { getPrototypeOf: trap, get: trap });
    const signal = Object.defineProperty(new AbortController().signal, "aborted", { get: trap });
    const { ports } = fakePorts();
    for (const unsafe of [Object.create(prototype), signal, new Proxy(signal, { get: trap })]) {
      await expect(requestCoinbaseSmokeObservation({ request: request(), signal: unsafe }, ports)).rejects.toThrow("CANCEL_SIGNAL_INVALID");
    }
    expect(trap).not.toHaveBeenCalled(); expect(ports.acquireLease).not.toHaveBeenCalled(); expect(ports.resolveIpv4).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled();
  });
  it("orders lease before DNS before open, and snapshots trusted ports before awaiting", async () => {
    const { ports, response, release } = fakePorts(), order: string[] = [];
    const replacement = vi.fn(async () => response);
    ports.acquireLease.mockImplementation(async () => { order.push("lease"); ports.open = replacement; return { release }; });
    ports.resolveIpv4.mockImplementation(async () => { order.push("DNS"); return ["8.8.8.8"]; });
    const original = ports.open; original.mockImplementation(async () => { order.push("HTTP"); return response; });
    await requestCoinbaseSmokeObservation({ request: request() }, ports);
    expect(order).toEqual(["lease", "DNS", "HTTP"]); expect(replacement).not.toHaveBeenCalled();
  });
  it.each([
    { query: [{ key: "end", value: config().end }, { key: "end", value: config().end }, { key: "start", value: config().start }] },
    { query: [{ key: "start", value: config().start }, { key: "granularity", value: "86400" }, { key: "end", value: config().end }] },
    { body: null }, { port: 443 }, { fragment: "private-canary" }, { userinfo: "private-canary" },
  ])("rejects noncanonical query and extra URL/body dimensions %j before any ports", async patch => {
    const { ports } = fakePorts();
    await expect(requestCoinbaseSmokeObservation({ request: { ...request(1), ...patch } }, ports)).rejects.toThrow("M5_COINBASE_SMOKE_");
    expect(ports.acquireLease).not.toHaveBeenCalled(); expect(ports.resolveIpv4).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled();
  });
  it("deep freezes every nested result and plan without exposing producer-owned bytes", () => {
    const frozen = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozen(child);
    };
    frozen(createCoinbaseSmokeAuthorization(draft())); frozen(planCoinbaseSmoke(config()));
    frozen(parse(product)); frozen(parse(`[${candle()}]`, 1)); frozen(parse(stats, 2));
    const bytes = encode(product), result = parseCoinbaseSmokeResponse({ request: request(), body: bytes, receivedAt: now, evaluationAt: now });
    bytes.fill(0); expect(result.payloadFingerprint).toBe(parse(product).payloadFingerprint); expect(result.product?.status).toBe("online");
  });
  it("validates up to 300 provider candles but selects/audits only two in-range buckets", () => {
    const rows = Array.from({ length: 300 }, (_, index) => candle(first + (1 - index) * 86400));
    const result = parse(`[${rows.join(",")}]`, 1);
    expect(result.providerCandleCount).toBe(300); expect(result.candleCount).toBe(2);
    expect(result.excludedBeforeStart).toBe(298); expect(result.excludedAtOrAfterEnd).toBe(0);
    expect(result.candles.map(row => row.bucketStart)).toEqual([config().start, "2026-10-01T00:00:00.000Z"]);
    expect(() => parse(`[${rows.join(",")},${candle(first - 300 * 86400)}]`, 1)).toThrow("PROVIDER_CANDLE_LIMIT_EXCEEDED");
    const outside = parse(`[${candle(first - 86400)},${candle()},${candle(first + 86400)},${candle(first + 172800)}]`, 1);
    expect(outside).toMatchObject({ providerCandleCount: 4, candleCount: 2, excludedBeforeStart: 1, excludedAtOrAfterEnd: 1 });
    expect(() => parse(`[${candle(first - 86400)},${candle(first - 86400)}]`, 1)).toThrow("CANDLE_ORDER_INVALID");
  });
  it("does not fill missing buckets or assert finality for a current candle", () => {
    const current = parse(`[${candle(first + 86400)}]`, 1); expect(current.candleCount).toBe(1);
    expect(current.providerTimestamp).toBeNull(); expect(JSON.stringify(current)).not.toMatch(/READY|QUALIFIED|FINALIZED|AUTHORITATIVE_DAILY_CLOSE/);
  });
  it("sorts independently of locale and rejects full-response order reversal", () => {
    const locale = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => { throw new Error("locale-canary"); });
    try {
      expect(parse(`[${candle(first + 86400)},${candle()}]`, 1).candles[0].bucketStart).toBe(config().start);
      createCoinbaseSmokeAuthorization(draft()); expect(locale).not.toHaveBeenCalled();
    } finally { locale.mockRestore(); }
    expect(() => parse(`[${candle(first - 86400)},${candle(first + 86400)},${candle()}]`, 1)).toThrow("CANDLE_ORDER_INVALID");
  });
  it.each(["-0", "-1", "1e129", "1e-129", "1".repeat(129)])("rejects decimal grammar/atom/scale violation %s", volume => {
    expect(() => parse(`[[${first},2000,2002,2001,2001,${volume}]]`, 1)).toThrow("DECIMAL_INVALID");
  });
  it("rejects timestamp overflow and excessive JSON depth/node count", () => {
    expect(() => parse(`[[253402300800,2000,2002,2001,2001,1]]`, 1)).toThrow("CANDLE_TIMESTAMP_INVALID");
    expect(() => parse('['.repeat(18) + '0' + ']'.repeat(18), 1)).toThrow("JSON_INVALID");
    expect(() => parse('[' + Array(4100).fill('0').join(',') + ']', 1)).toThrow("JSON_INVALID");
  });
  it("uses intrinsic byte lengths and copies without caller iterator/getter calls", async () => {
    const getter = vi.fn(() => { throw new Error("byte-getter-canary"); });
    const body = encode(product);
    Object.defineProperty(body, "byteLength", { get: getter }); Object.defineProperty(body, Symbol.iterator, { get: getter });
    expect(parseCoinbaseSmokeResponse({ request: request(), body, receivedAt: now, evaluationAt: now }).product?.id).toBe("ETH-USD");
    expect(getter).not.toHaveBeenCalled();
    const large = new Uint8Array(524289); Object.defineProperty(large, "byteLength", { value: 1 });
    expect(() => parseCoinbaseSmokeResponse({ request: request(), body: large, receivedAt: now, evaluationAt: now })).toThrow("BODY_INVALID");
    const { ports, response, release } = fakePorts();
    ports.open.mockImplementation(async () => ({ ...response, body: (async function* () { yield large; })() }));
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("RESPONSE_TOO_LARGE"); expect(release).toHaveBeenCalledOnce();
  });
  it.each(["success", "DNS", "HTTP", "parse"])("releases acquired lease once on %s", async phase => {
    const { ports, response, cancel, release } = fakePorts(phase === "parse" ? "{" : product);
    if (phase === "DNS") ports.resolveIpv4.mockResolvedValue(["127.0.0.1"]);
    if (phase === "HTTP") ports.open.mockImplementation(async () => ({ ...response, status: 500 }));
    if (phase === "success") await requestCoinbaseSmokeObservation({ request: request() }, ports);
    else await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("M5_COINBASE_SMOKE_");
    expect(release).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledTimes(phase === "DNS" ? 0 : 1);
  });
  it("releases a late lease after timeout without DNS/HTTP", async () => {
    vi.useFakeTimers(); const { ports, release } = fakePorts();
    let settle!: (handle: { release(): void }) => void;
    ports.acquireLease.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    const rejected = expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("TIMEOUT");
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    settle({ release }); await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledOnce(); expect(ports.resolveIpv4).not.toHaveBeenCalled(); expect(ports.open).not.toHaveBeenCalled();
  });
  it("cancels late HTTP completion, releases lease and never consumes late body", async () => {
    vi.useFakeTimers(); const { ports, response, release, cancel } = fakePorts();
    let settle!: (response: Awaited<ReturnType<CoinbaseSmokeHttpPorts["open"]>>) => void;
    const consume = vi.fn(); ports.open.mockImplementation(() => new Promise(resolve => { settle = resolve; }));
    const rejected = expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("TIMEOUT");
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    settle({ ...response, body: (async function* () { consume(); yield encode(product); })() }); await vi.advanceTimersByTimeAsync(0);
    expect(release).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce(); expect(consume).not.toHaveBeenCalled();
  });
  it("propagates sanitized cancellation during stream and rejects pre-aborted input before ports", async () => {
    const { ports, response, release, cancel } = fakePorts(); const controller = new AbortController();
    controller.abort("private-abort-canary");
    await expect(requestCoinbaseSmokeObservation({ request: request(), signal: controller.signal }, ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_CANCELLED$/);
    expect(ports.acquireLease).not.toHaveBeenCalled();
    const active = new AbortController();
    ports.open.mockImplementation(async () => ({ ...response, body: (async function* () { active.abort("private-abort-canary"); yield encode(product); })() }));
    await expect(requestCoinbaseSmokeObservation({ request: request(), signal: active.signal }, ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_CANCELLED$/);
    expect(release).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce();
  });
  it("does not read opaque Error.message getters or accept forged internal error codes", async () => {
    const { ports } = fakePorts(); const getter = vi.fn(() => { throw new Error("private-error-canary"); });
    const unsafe = Object.defineProperty(new Error(), "message", { get: getter });
    ports.open.mockRejectedValue(unsafe);
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_TRANSPORT_FAILED$/);
    expect(getter).not.toHaveBeenCalled();
    ports.open.mockRejectedValue(new Error("M5_COINBASE_SMOKE_TIMEOUT"));
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_TRANSPORT_FAILED$/);
  });
  it.each(["0.0.0.0", "172.31.255.255", "192.0.2.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255", "2001:db8::1", "::ffff:8.8.8.8"])("denies reserved/documentation/IPv6 answer %s", async address => {
    const { ports, release } = fakePorts(); ports.resolveIpv4.mockResolvedValue([address]);
    await expect(requestCoinbaseSmokeObservation({ request: request() }, ports)).rejects.toThrow("DNS_REJECTED"); expect(ports.open).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledOnce();
  });
  it("parser/create do not issue operational authority and registries cannot be mutated", () => {
    const description = createCoinbaseSmokeAuthorization(draft()); expect(isRuntimeCoinbaseSmokeAuthorization(description)).toBe(false);
    expect(isRuntimeCoinbaseSmokeAuthorization(parseCoinbaseSmokeAuthorization(description))).toBe(false);
    expect(() => Array.prototype.push.call(COINBASE_SMOKE_AUTHORITY_REGISTRIES.LOCAL_SMOKE, { authorizationId: description.authorizationId, fingerprint: description.fingerprint })).toThrow();
  });
  it("CoinGecko acquisition, smoke and ingestion/persistence reject Coinbase observation before ports", async () => {
    const observation = parse(product), send = vi.fn(), acquire = vi.fn(), resolveCredential = vi.fn();
    expect(isTrustedM5ProviderLiveAcquisitionForIngestion(observation)).toBe(false);
    const smoke = await executeM5ProviderLiveSmoke({ config: observation, authorization: observation, providerId: "coingecko", environment: "LOCAL_SMOKE", asOf: now, currentTime: () => now, trustedRegistry: [], credentials: { resolve: resolveCredential }, transport: { send }, rateLimit: { acquire } });
    expect(smoke.status).toBe("INVALID"); expect(smoke.code).toBe("M5_PROVIDER_SMOKE_CONFIG_INVALID");
    const acquisition = await executeM5ProviderLiveAcquisition(observation as unknown as Parameters<typeof executeM5ProviderLiveAcquisition>[0]);
    expect(acquisition).toEqual({ status: "INVALID", code: "M5_PROVIDER_LIVE_REQUEST_INVALID" });
    const withTransaction = vi.fn(async () => { throw new Error("must-not-start-uow"); });
    const handoff = await executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: observation, asOf: now, scope: {} as Parameters<typeof executeM5CoinGeckoAcquisitionIngestionHandoff>[0]["scope"], apply: true, unitOfWork: { withTransaction } });
    expect(handoff).toEqual({ status: "BLOCKED", code: "M5_ACQUISITION_HANDOFF_UNTRUSTED_ACQUISITION" });
    await expect(executeManualIngestionToLineage(observation, { apply: true, unitOfWork: { withTransaction } })).rejects.toThrow();
    expect(withTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled(); expect(acquire).not.toHaveBeenCalled(); expect(resolveCredential).not.toHaveBeenCalled();
  });
  it.each([
    { args: ["--help"], exit: 0, kind: "usage" },
    { args: ["--start", config().start, "--end", config().end], exit: 0, kind: "mode" },
    { args: ["--start", config().start, "--end", config().end, "--execute", "--environment", "LOCAL_SMOKE", "--authorization", "review:synthetic"], exit: 2, kind: "status" },
    { args: ["--unknown", "private-cli-canary"], exit: 2, kind: "error" },
    { args: ["--start", config().start, "--end", config().end, "--environment", ""], exit: 2, kind: "error" },
    { args: ["--start", config().start, "--end", config().end, "--execute"], exit: 2, kind: "error" },
    { args: ["--start", config().start, "--end", config().end, "--start", config().start], exit: 2, kind: "error" },
  ])("CLI subprocess: %j (no listen IPC, no inherited environment)", ({ args, exit, kind }) => {
    const api = pathToFileURL(resolve("node_modules/tsx/dist/esm/api/index.mjs")).href;
    const initializer = `import {register} from ${JSON.stringify(api)};register({tsconfig:${JSON.stringify(resolve("scripts/tsconfig.json"))}});`;
    const child = spawnSync(process.execPath, ["--no-warnings", "--import", `data:text/javascript,${encodeURIComponent(initializer)}`, resolve("scripts/m5-coinbase-smoke.ts"), ...args], { env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 15000, windowsHide: true });
    expect(child.error).toBeUndefined(); expect(child.status).toBe(exit);
    expect(child.stdout + child.stderr).not.toMatch(/private-cli-canary|EPERM|\.env.local|secret|raw-payload/);
    const json = JSON.parse(kind === "error" ? child.stderr.trim() : child.stdout.trim());
    if (kind === "mode") expect(json).toMatchObject({ mode: "DRY_RUN", credentialReferences: [], productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
    if (kind === "status") expect(json).toMatchObject({ status: "BLOCKED", requestCount: 0 });
    if (kind === "error") expect(json).toEqual({ status: "INVALID", code: "M5_COINBASE_SMOKE_ARGUMENT_OR_PLAN_INVALID" });
    if (kind === "usage") expect(json.usage).toContain("Usage:");
  });
});

describe("empty registry and side-effect-free CLI", () => {
  it("rejects copies/serialization/clones/lookalikes as runtime trust", () => {
    const auth = createCoinbaseSmokeAuthorization(draft()); expect(isRuntimeCoinbaseSmokeAuthorization(auth)).toBe(false);
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
