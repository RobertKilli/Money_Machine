import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { evaluateM5ProviderReadinessConfig } from "@/application/intelligence/evaluate-m5-provider-readiness";
import { evaluateM5ProviderReadinessAggregate } from "@/application/intelligence/evaluate-m5-provider-readiness-aggregate";
import {
  executeM5ProviderLiveAcquisition,
  parseM5LiveCoinGeckoResponse,
  parseM5LiveEtherscanCreation,
  parseM5LiveEtherscanVerification,
  planM5ProviderLiveAcquisition,
  validateM5ProviderAuthorizationTime,
} from "@/application/intelligence/m5-provider-live-acquisition";
import { projectCoinGeckoToNormalizedPackage, parseCoinGeckoFixture } from "@/application/intelligence/m5-provider-adapter-contracts";
import { parseM5ProviderReadinessAggregateConfig } from "@/domain/intelligence/m5-provider-readiness-aggregate";
import type { M5ProviderHttpTransport } from "@/application/intelligence/m5-provider-execution-boundary";

const now = "2026-09-25T12:00:00.000Z";
const address = "0x1111111111111111111111111111111111111111";
const providerConfig = JSON.parse(readFileSync("config/m5/provider-readiness.production.json", "utf8")) as unknown;
const aggregateConfig = parseM5ProviderReadinessAggregateConfig(JSON.parse(readFileSync("config/m5/provider-readiness.aggregate.production.json", "utf8")) as unknown);
function productionAggregate() {
  const readiness = evaluateM5ProviderReadinessConfig({ config: providerConfig, evaluatedAt: now });
  const sourceId = aggregateConfig.sources[0]!.sourceId;
  const aggregate = evaluateM5ProviderReadinessAggregate({ config: aggregateConfig, sources: [{ sourceId, config: providerConfig, evaluation: readiness }], evaluatedAt: now });
  return { readiness, aggregate };
}
function coinRequest() {
  return { providerId: "coingecko" as const, coinId: "ethereum", contractAddress: address, from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z", datasetVersion: "coingecko-market-chart/range-v1" };
}
function body(value: string): Uint8Array { return new TextEncoder().encode(value); }

describe("M5 provider live acquisition", () => {
  it("validates canonical, nonfuture and fresh caller asOf against the injected clock", () => {
    expect(validateM5ProviderAuthorizationTime(now, now)).toBeUndefined();
    expect(validateM5ProviderAuthorizationTime("2026-09-25T12:00:00Z", now)).toBe("M5_PROVIDER_LIVE_AS_OF_INVALID");
    expect(validateM5ProviderAuthorizationTime("2026-09-26T12:00:00.000Z", now)).toBe("M5_PROVIDER_LIVE_AS_OF_FUTURE");
    expect(validateM5ProviderAuthorizationTime("2026-09-25T11:59:54.000Z", now)).toBe("M5_PROVIDER_LIVE_AS_OF_STALE");
    expect(validateM5ProviderAuthorizationTime(now, "invalid")).toBe("M5_PROVIDER_LIVE_CLOCK_INVALID");
  });

  it("creates only deterministic, fixed-host CoinGecko and Etherscan request plans", () => {
    const coin = planM5ProviderLiveAcquisition({ request: coinRequest() });
    expect(coin.scope).toEqual({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1" });
    expect(coin.requests).toHaveLength(1);
    expect(coin.requests[0]).toMatchObject({ protocol: "https:", hostname: "pro-api.coingecko.com", path: `/api/v3/coins/ethereum/contract/${address}/market_chart/range` });
    expect(coin.requests[0]!.query.map(item => item.key).sort()).toEqual(["from", "interval", "to", "vs_currency"]);
    expect(JSON.stringify(coin)).not.toMatch(/api[_-]?key|secret|credential/i);
    const etherscan = planM5ProviderLiveAcquisition({ request: { providerId: "etherscan", contractAddress: address.toUpperCase().replace("0X", "0x"), datasetVersion: "etherscan-api-v2/v1" } });
    expect(etherscan.requests.map(item => item.query.find(q => q.key === "action")?.value)).toEqual(["getcontractcreation", "getsourcecode"]);
    expect(etherscan.requests.every(item => item.hostname === "api.etherscan.io" && item.path === "/v2/api" && item.query.some(q => q.key === "chainid" && q.value === "1"))).toBe(true);
    expect(etherscan.requests.flatMap(item => item.query).some(item => /apikey|token|secret/i.test(item.key))).toBe(false);
  });

  it("parses live CoinGecko bytes through the fixture contract with receipt-independent payload identity", () => {
    const response = body('{"prices":[[1767225600000,0.00000001]],"market_caps":[[1767225600000,1234.5]],"total_volumes":[[1767225600000,0]]}');
    const first = parseM5LiveCoinGeckoResponse({ body: response, coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: now });
    const laterAt = "2026-09-25T12:05:00.000Z";
    const later = parseM5LiveCoinGeckoResponse({ body: response, coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: laterAt });
    expect(first.daily[0]?.price).toEqual({ valueAtoms: 1n, scale: 8 });
    expect(first.payloadFingerprint).toBe(later.payloadFingerprint);
    expect(first.receipt.receivedAt).not.toBe(later.receipt.receivedAt);
    const replayFixture = parseCoinGeckoFixture({ providerId: "coingecko", datasetId: first.datasetId, datasetVersion: first.datasetVersion, network: "eth", contractAddress: address,
      coinId: "ethereum", receipt: { receivedAt: now }, prices: [{ timestamp: "1767225600000", price: "0.00000001" }],
      marketCaps: [{ timestamp: "1767225600000", price: "1234.5", marketCap: "1234.5" }], totalVolumes: [{ timestamp: "1767225600000", price: "0" }], pools: [] });
    expect(first.payloadFingerprint).toBe(replayFixture.payloadFingerprint);
    const firstPackage = projectCoinGeckoToNormalizedPackage({ fixture: first, idempotencyKey: "live-equivalence", requestedAt: now, startedAt: now, recordedAt: now });
    const laterPackage = projectCoinGeckoToNormalizedPackage({ fixture: later, idempotencyKey: "live-equivalence", requestedAt: now, startedAt: now, recordedAt: laterAt });
    expect(firstPackage.records.map(record => record.payloadFingerprint)).toEqual(laterPackage.records.map(record => record.payloadFingerprint));
    expect(firstPackage.records[0]?.retrievedAt).not.toBe(laterPackage.records[0]?.retrievedAt);
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => parseM5LiveCoinGeckoResponse({ body: body('{"prices":[[1,2]],"market_caps":[],"total_volumes":[],"api_key":"never-log"}'), coinId: "ethereum", contractAddress: address, datasetVersion: "v1", retrievedAt: now })).toThrow();
    expect(() => parseM5LiveCoinGeckoResponse({ body: body('{"prices":[],"prices":[],"market_caps":[],"total_volumes":[]}'), coinId: "ethereum", contractAddress: address, datasetVersion: "v1", retrievedAt: now })).toThrow("M5_PROVIDER_LIVE_JSON_INVALID");
  });

  it("preserves provider decimal tokens exactly through fixed-point projection and rejects unsupported forms", () => {
    const make = (price: string, cap = "0", volume = "0") => parseM5LiveCoinGeckoResponse({
      body: body(`{"prices":[[1767225600000,${price}]],"market_caps":[[1767225600000,${cap}]],"total_volumes":[[1767225600000,${volume}]]}`),
      coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: now,
    });
    const aboveSafeInteger = make("9007199254740993", "9007199254740993", "9007199254740993");
    expect(aboveSafeInteger.daily[0]?.price).toEqual({ valueAtoms: 9007199254740993n, scale: 0 });
    const highPrecision = make("0.123456789012345678", "0.000000000000000001", "3.450000000000000001");
    expect(highPrecision.daily[0]?.price).toEqual({ valueAtoms: 123456789012345678n, scale: 18 });
    expect(highPrecision.daily[0]?.marketCap).toEqual({ valueAtoms: 1n, scale: 18 });
    expect(highPrecision.daily[0]?.volume).toEqual({ valueAtoms: 3450000000000000001n, scale: 18 });
    const normalized = projectCoinGeckoToNormalizedPackage({ fixture: highPrecision, idempotencyKey: "precision", requestedAt: now, startedAt: now, recordedAt: now });
    expect(normalized.records[0]?.normalizedEnvelope).toMatchObject({ closeValueAtoms: "123456789012345678", priceScale: 18, marketCapAtoms: "1", marketCapScale: 18, volumeAtoms: "3450000000000000001", volumeScale: 18 });
    const equivalent = make("1.2300");
    const equivalentCanonical = make("1.23");
    expect(equivalent.payloadFingerprint).toBe(equivalentCanonical.payloadFingerprint);
    expect(make("1.24").payloadFingerprint).not.toBe(equivalent.payloadFingerprint);
    expect(make("1", "0", "0").daily[0]?.marketCap).toEqual({ valueAtoms: 0n, scale: 0 });
    expect(() => make("-0.1")).toThrow();
    expect(() => make("1e3")).toThrow();
    expect(() => make("0.1234567890123456789")).toThrow();
    expect(() => make("9223372036854775808")).toThrow();
    expect(() => parseM5LiveCoinGeckoResponse({ body: body('{"prices":[[1767225600000,"1"]],"market_caps":[[1767225600000,0]],"total_volumes":[[1767225600000,0]]}'), coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: now })).toThrow();
  });

  it("classifies Etherscan verification conservatively and omits provider source text", () => {
    expect(parseM5LiveEtherscanCreation(body('{"status":"0","message":"NOTOK","result":"No records found"}'), address)).toBeUndefined();
    expect(parseM5LiveEtherscanCreation(body('{"status":"1","message":"OK","result":"No records found"}'), address)).toBeUndefined();
    expect(parseM5LiveEtherscanVerification(body('{"status":"0","message":"NOTOK","result":"No records found"}'))).toEqual({ status: "UNKNOWN" });
    expect(parseM5LiveEtherscanVerification(body('{"status":"1","message":"OK","result":[{"SourceCode":"","Proxy":"0","Implementation":""}]}'))).toEqual({ status: "UNVERIFIED" });
    expect(parseM5LiveEtherscanVerification(body('{"status":"1","message":"OK","result":[{"SourceCode":"pragma solidity; sensitive-source","Proxy":"0","Implementation":""}]}'))).toEqual({ status: "VERIFIED", proxy: false });
    expect(parseM5LiveEtherscanVerification(body('{"status":"1","message":"OK","result":[{"SourceCode":"pragma solidity; sensitive-source","Proxy":"1","Implementation":""}]}'))).toEqual({ status: "UNKNOWN" });
    expect(JSON.stringify(parseM5LiveEtherscanVerification(body('{"status":"1","message":"OK","result":[{"SourceCode":"credential-secret-source","Proxy":"0","Implementation":""}]}')))).not.toContain("credential-secret-source");
    expect(parseM5LiveEtherscanCreation(body('{"status":"1","message":"OK","result":[{"contractAddress":"' + address + '","blockNumber":"19000000","timestamp":"1767225600","txHash":"0x' + "a".repeat(64) + '"}]}'), address)).toEqual({ blockNumber: "19000000", timestamp: "1767225600" });
  });

  it("keeps production execution blocked before credential and transport ports", async () => {
    const { readiness, aggregate } = productionAggregate();
    expect(aggregate.result).toBe("BLOCKED");
    expect(aggregate.blockers).toContain("M5_AGGREGATE_APPROVAL_AUTHORITY_MISSING");
    const credentialResolve = vi.fn(async () => ({ kind: "API_KEY" as const, value: "must-never-be-read" }));
    const send = vi.fn(async (): Promise<never> => { throw new Error("transport must not run"); });
    const result = await executeM5ProviderLiveAcquisition({
      aggregate, readiness, request: coinRequest(), asOf: now, currentTime: () => now, credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" },
      credentials: { resolve: credentialResolve }, transport: { send } as M5ProviderHttpTransport,
      rateLimit: { acquire: vi.fn(async () => true) }, requestedAt: now, startedAt: now, recordedAt: now,
    });
    expect(result).toEqual({ status: "BLOCKED", code: "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED" });
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    const handBuilt = { ...aggregate, result: "READY" as const, validUntil: "2027-01-01T00:00:00.000Z" };
    const forged = await executeM5ProviderLiveAcquisition({ aggregate: handBuilt, readiness, request: coinRequest(), asOf: now, currentTime: () => now,
      credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" }, credentials: { resolve: credentialResolve },
      transport: { send } as M5ProviderHttpTransport, rateLimit: { acquire: async () => true },
      requestedAt: now, startedAt: now, recordedAt: now });
    expect(forged.status).toBe("BLOCKED");
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    const serialized = JSON.parse(JSON.stringify(aggregate)) as typeof aggregate;
    const serializedReady = { ...serialized, result: "READY" as const, validUntil: "2027-01-01T00:00:00.000Z" };
    const serializedForgery = await executeM5ProviderLiveAcquisition({ aggregate: serializedReady, readiness, request: coinRequest(), asOf: now, currentTime: () => now,
      credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" }, credentials: { resolve: credentialResolve }, transport: { send } as M5ProviderHttpTransport,
      rateLimit: { acquire: vi.fn(async () => true) }, requestedAt: now, startedAt: now, recordedAt: now });
    expect(serializedForgery.status).toBe("BLOCKED");
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps production blocked before either credential or HTTP boundary for malformed asOf", async () => {
    const { readiness, aggregate } = productionAggregate();
    const credentialResolve = vi.fn(async () => ({ kind: "API_KEY" as const, value: "never" }));
    const send = vi.fn();
    const result = await executeM5ProviderLiveAcquisition({ aggregate, readiness, request: coinRequest(), asOf: "2026-09-25T12:00:00Z", currentTime: () => now,
      credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" }, credentials: { resolve: credentialResolve },
      transport: { send } as unknown as M5ProviderHttpTransport, rateLimit: { acquire: async () => true },
      requestedAt: now, startedAt: now, recordedAt: now });
    expect(result).toEqual({ status: "BLOCKED", code: "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED" });
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps production blocked before rate lease, credential, or HTTP for future asOf", async () => {
    const { readiness, aggregate } = productionAggregate();
    const credentialResolve = vi.fn(async () => ({ kind: "API_KEY" as const, value: "test-canary-secret" }));
    const lease = vi.fn(async () => true);
    const send = vi.fn();
    const result = await executeM5ProviderLiveAcquisition({ aggregate, readiness, request: coinRequest(), asOf: "2026-09-26T12:00:00.000Z", currentTime: () => now,
      credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" }, credentials: { resolve: credentialResolve },
      transport: { send } as unknown as M5ProviderHttpTransport, rateLimit: { acquire: lease },
      requestedAt: now, startedAt: now, recordedAt: now });
    expect(result).toEqual({ status: "BLOCKED", code: "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED" });
    expect(lease).not.toHaveBeenCalled();
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps production blocked before rate lease, credential, or HTTP for stale asOf", async () => {
    const { readiness, aggregate } = productionAggregate();
    const credentialResolve = vi.fn(async () => ({ kind: "API_KEY" as const, value: "test-canary-secret" }));
    const lease = vi.fn(async () => true);
    const send = vi.fn();
    const result = await executeM5ProviderLiveAcquisition({ aggregate, readiness, request: coinRequest(), asOf: "2026-09-25T11:59:54.000Z", currentTime: () => now,
      credential: { kind: "API_KEY", reference: "env:coingecko-pro-api-key" }, credentials: { resolve: credentialResolve },
      transport: { send } as unknown as M5ProviderHttpTransport, rateLimit: { acquire: lease }, requestedAt: now, startedAt: now, recordedAt: now });
    expect(result).toEqual({ status: "BLOCKED", code: "M5_PROVIDER_READINESS_AGGREGATE_BLOCKED" });
    expect(lease).not.toHaveBeenCalled();
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects canary secret material in a credential reference without echoing it", async () => {
    const { readiness, aggregate } = productionAggregate();
    const canary = "test-canary-secret-value";
    const credentialResolve = vi.fn(async () => ({ kind: "API_KEY" as const, value: canary }));
    const lease = vi.fn(async () => true);
    const send = vi.fn();
    const result = await executeM5ProviderLiveAcquisition({ aggregate, readiness, request: coinRequest(), asOf: now, currentTime: () => now,
      credential: { kind: "API_KEY", reference: canary }, credentials: { resolve: credentialResolve },
      transport: { send } as unknown as M5ProviderHttpTransport, rateLimit: { acquire: lease }, requestedAt: now, startedAt: now, recordedAt: now });
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(lease).not.toHaveBeenCalled();
    expect(credentialResolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
