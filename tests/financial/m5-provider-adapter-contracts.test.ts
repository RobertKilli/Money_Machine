import { describe, expect, it, vi } from "vitest";
import {
  M5_PROVIDER_AVAILABILITY_POLICY_VERSION,
  buildCoinGeckoMarketRequestPlan,
  buildEtherscanContractRequestPlan,
  deriveCoinGeckoDailyMetrics,
  parseCoinGeckoFixture,
  parseEtherscanFixture,
  projectCoinGeckoToNormalizedPackage,
  projectEtherscanToNormalizedPackage,
} from "@/application/intelligence/m5-provider-adapter-contracts";
import { buildManualIngestionToLineagePlan, executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";

const address = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
const receipt = "2026-02-01T00:00:00.000Z";
const recordedAt = "2026-02-01T00:00:04.000Z";

function dailyRows(kind: "prices" | "marketCaps" | "totalVolumes") {
  return Array.from({ length: 15 }, (_, index) => {
    const timestamp = Date.UTC(2026, 0, index + 1);
    const price = kind === "prices" ? `${100 + index}.01` : kind === "marketCaps" && index === 0 ? "0" : (kind === "marketCaps" ? `${1_000_000 + index}.01` : `${10_000 + index}.01`);
    return { timestamp, price, marketCap: kind === "marketCaps" && index === 0 ? null : price, volume: null };
  });
}

function coinGeckoFixture(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "coingecko",
    datasetId: "coingecko-market-chart",
    datasetVersion: "coingecko-market-chart/v1",
    network: "eth",
    contractAddress: address,
    coinId: "synthetic-asset",
    receipt: { receivedAt: receipt, pages: [{ pageOrdinal: 0, receivedAt: receipt }] },
    prices: dailyRows("prices"),
    marketCaps: dailyRows("marketCaps"),
    totalVolumes: dailyRows("totalVolumes"),
    pools: [{ poolId: "pool-1", dexId: "synthetic-dex", reserveUsd: "12345.67", volume24hUsd: "987.65" }],
    ...overrides,
  };
}

function etherscanFixture(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "etherscan",
    datasetId: "etherscan-contract-authority",
    datasetVersion: "etherscan-api-v2/v1",
    chainid: "1",
    address,
    receipt: { receivedAt: receipt },
    creation: { blockNumber: "19000000", blockHash: `0x${"a".repeat(64)}`, timestamp: Date.UTC(2025, 0, 1) },
    sourceCode: { status: "VERIFIED", proxy: false },
    ...overrides,
  };
}

describe("M5 typed provider adapter contracts", () => {
  it("builds deterministic secret-free request plans", () => {
    const cg = buildCoinGeckoMarketRequestPlan({ coinId: "synthetic-asset", contractAddress: address, from: "2026-01-01T00:00:00.000Z", to: receipt });
    const es = buildEtherscanContractRequestPlan({ contractAddress: address });
    expect(cg).toEqual(buildCoinGeckoMarketRequestPlan({ coinId: "synthetic-asset", contractAddress: address, from: "2026-01-01T00:00:00.000Z", to: receipt }));
    expect(es.query).toEqual({ chainid: "1", module: "contract", action: "getsourcecode", address: address.toLowerCase() });
    expect(JSON.stringify({ cg, es })).not.toMatch(/api[-_]?key|authorization|token/i);
  });

  it("rejects unknown and secret-like fixture fields", () => {
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), unexpected: true })).toThrow("M5_COINGECKO_FIXTURE_UNKNOWN_FIELD");
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), apiKey: "secret" })).toThrow("M5_PROVIDER_SECRET_FIELD_REJECTED");
    expect(() => parseEtherscanFixture({ ...etherscanFixture(), query: "https://example.test/?apikey=secret" })).toThrow("M5_ETHERSCAN_FIXTURE_UNKNOWN_FIELD");
    expect(() => parseEtherscanFixture({ ...etherscanFixture(), apiKey: "secret" })).toThrow("M5_PROVIDER_SECRET_FIELD_REJECTED");
  });

  it("parses CoinGecko identity, null market cap, decimal atoms and bounded pool capability", () => {
    const parsed = parseCoinGeckoFixture(coinGeckoFixture());
    expect(parsed.contractAddress).toBe(address.toLowerCase());
    expect(parsed.daily).toHaveLength(15);
    expect(parsed.daily[0]?.price).toEqual({ valueAtoms: 10001n, scale: 2 });
    expect(parsed.daily[0]?.marketCap).toBeUndefined();
    expect(parsed.pools[0]?.reserveUsd).toEqual({ valueAtoms: 1234567n, scale: 2 });
    expect(parsed.capabilities.concentration).toBe("UNSUPPORTED");
    expect(parsed.capabilities.canonicalIdentity).toBe("UNSUPPORTED");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.daily)).toBe(true);
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), prices: dailyRows("prices").map((row, index) => index === 2 ? { ...row, price: "0.00" } : row) })).toThrow("M5_COINGECKO_PRICE_INVALID");
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), prices: [{ ...dailyRows("prices")[0], price: "1e3" }, ...dailyRows("prices").slice(1)] })).toThrow("M5_COINGECKO_DAILY_INVALID");
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), datasetId: "other-dataset" })).toThrow("M5_COINGECKO_SCOPE_INVALID");
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), contractAddress: "0x1234" })).toThrow("M5_COINGECKO_ADDRESS_INVALID");
  });

  it("normalizes order, but changes to material payload change identity fingerprints", () => {
    const original = parseCoinGeckoFixture(coinGeckoFixture());
    const shuffled = parseCoinGeckoFixture({ ...coinGeckoFixture(), prices: [...dailyRows("prices")].reverse(), marketCaps: [...dailyRows("marketCaps")].reverse(), totalVolumes: [...dailyRows("totalVolumes")].reverse(), pools: [...(coinGeckoFixture().pools as unknown[])].reverse() });
    expect(shuffled.daily).toEqual(original.daily);
    expect(shuffled.identityFingerprint).toBe(original.identityFingerprint);
    expect(shuffled.payloadFingerprint).toBe(original.payloadFingerprint);
    const changed = parseCoinGeckoFixture({ ...coinGeckoFixture(), contractAddress: "0x0000000000000000000000000000000000000001" });
    expect(changed.identityFingerprint).not.toBe(original.identityFingerprint);
    const changedPrice = parseCoinGeckoFixture({ ...coinGeckoFixture(), prices: dailyRows("prices").map((row, index) => index === 3 ? { ...row, price: "777.01" } : row) });
    expect(changedPrice.payloadFingerprint).not.toBe(original.payloadFingerprint);
  });

  it("enforces availability policy including multi-page maximum and future publication rejection", () => {
    const parsed = parseCoinGeckoFixture({ ...coinGeckoFixture(), receipt: { receivedAt: receipt, pages: [{ pageOrdinal: 1, receivedAt: "2026-02-01T00:00:03.000Z" }, { pageOrdinal: 0, receivedAt: "2026-02-01T00:00:02.000Z" }] } });
    const pkg = projectCoinGeckoToNormalizedPackage({ fixture: parsed, idempotencyKey: "fixture-replay", requestedAt: receipt, startedAt: receipt, recordedAt });
    expect(pkg.records.every(record => record.retrievedAt === "2026-02-01T00:00:03.000Z")).toBe(true);
    expect(pkg.provenance.reviewReference).toBe(M5_PROVIDER_AVAILABILITY_POLICY_VERSION);
    expect(() => parseCoinGeckoFixture({ ...coinGeckoFixture(), receipt: { receivedAt: receipt, providerPublishedAt: "2026-02-02T00:00:00.000Z" } })).toThrow("M5_PROVIDER_AVAILABILITY_INVALID");
  });

  it("parses Etherscan verification states and rejects ambiguous proxy claims", () => {
    const parsed = parseEtherscanFixture(etherscanFixture());
    expect(parsed.chainNamespace).toBe("eip155:1");
    expect(parsed.creation.blockNumber).toBe(19000000n);
    expect(parsed.verification.state).toBe("VERIFIED");
    expect(parseEtherscanFixture({ ...etherscanFixture(), apiStatus: "0", apiMessage: "No data found", sourceCode: null }).verification.state).toBe("UNKNOWN");
    expect(parseEtherscanFixture({ ...etherscanFixture(), sourceCode: { status: "UNKNOWN" } }).verification.state).toBe("UNKNOWN");
    expect(parseEtherscanFixture({ ...etherscanFixture(), sourceCode: { status: "VERIFIED", proxy: true } }).verification.state).toBe("UNKNOWN");
    expect(() => parseEtherscanFixture({ ...etherscanFixture(), chainid: "137" })).toThrow("M5_ETHERSCAN_CHAIN_INVALID");
    expect(() => parseEtherscanFixture({ ...etherscanFixture(), datasetId: "other-dataset" })).toThrow("M5_ETHERSCAN_SCOPE_INVALID");
  });

  it("projects both providers to the existing normalized package contract", () => {
    const cgFixture = parseCoinGeckoFixture(coinGeckoFixture());
    const cg = projectCoinGeckoToNormalizedPackage({ fixture: cgFixture, idempotencyKey: "cg-replay", requestedAt: receipt, startedAt: receipt, recordedAt });
    const cgReplay = projectCoinGeckoToNormalizedPackage({ fixture: parseCoinGeckoFixture({ ...coinGeckoFixture(), prices: [...dailyRows("prices")].reverse(), marketCaps: [...dailyRows("marketCaps")].reverse(), totalVolumes: [...dailyRows("totalVolumes")].reverse() }), idempotencyKey: "cg-replay", requestedAt: receipt, startedAt: receipt, recordedAt });
    const es = projectEtherscanToNormalizedPackage({ fixture: parseEtherscanFixture(etherscanFixture()), idempotencyKey: "es-replay", requestedAt: receipt, startedAt: receipt, recordedAt });
    expect(cg.contractVersion).toBe("m5-normalized-source-package/v1");
    expect(cg.records).toHaveLength(15);
    expect(es.records).toHaveLength(2);
    expect(cg.records).toEqual(cgReplay.records);
    expect(cg.records[0]?.normalizedEnvelope).not.toHaveProperty("apiKey");
    expect(Object.isFrozen(cg)).toBe(true);
    expect(Object.isFrozen(cg.records)).toBe(true);
  });

  it("replays deterministically through the existing dry-run planner without opening a UoW", async () => {
    const packageValue = projectCoinGeckoToNormalizedPackage({ fixture: parseCoinGeckoFixture(coinGeckoFixture()), idempotencyKey: "dry-run-replay", requestedAt: receipt, startedAt: receipt, recordedAt });
    const first = await executeManualIngestionToLineage(packageValue, { apply: false });
    const second = buildManualIngestionToLineagePlan(packageValue);
    expect(first.status).toBe("DRY_RUN_READY");
    if (first.status !== "DRY_RUN_READY") return;
    expect(first.plan.sourceLineageId).toBe(second.sourceLineageId);
    expect(first.plan.sourceLineageFingerprint).toBe(second.sourceLineageFingerprint);
    const uow = { withTransaction: vi.fn() };
    await executeManualIngestionToLineage(packageValue, { apply: false, unitOfWork: uow as never });
    expect(uow.withTransaction).not.toHaveBeenCalled();
  });

  it("feeds 15 CoinGecko closes into the existing history/volatility derivations", () => {
    const result = deriveCoinGeckoDailyMetrics(parseCoinGeckoFixture(coinGeckoFixture()));
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.historySpan.value).toBe(14n);
    expect(result.volatility.unit).toBe("BPS");
    expect(result.historySpan.availableAt).toBe(receipt);
    expect(result.volatility.availableAt).toBe(receipt);
  });
});
