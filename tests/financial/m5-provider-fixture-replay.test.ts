import { describe, expect, it, vi } from "vitest";
import {
  executeM5CoinGeckoFixtureReplay,
  executeM5EtherscanFixtureReplay,
} from "@/application/intelligence/m5-provider-fixture-replay";
import type { M5ProviderHttpTransport } from "@/application/intelligence/m5-provider-execution-boundary";
import { evaluateM5ProviderReadinessConfig } from "@/application/intelligence/evaluate-m5-provider-readiness";
import type { M5ProviderCapability, ProviderCapabilityRequirement } from "@/domain/intelligence/m5-provider-readiness";
import { parseCoinGeckoFixture, parseEtherscanFixture } from "@/application/intelligence/m5-provider-adapter-contracts";
import { assertSourceEnvelope } from "@/domain/intelligence/ingestion-provenance";

const contractAddress = "0xabcdef0123456789abcdef0123456789abcdef01";
const requestedAt = "2026-01-31T23:59:00.000Z";
const receiptAt = "2026-02-01T00:00:00.000Z";
const recordedAt = "2026-02-01T00:00:01.000Z";

const usageDecisions = ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"].map(usage => ({
  usage,
  approval: "APPROVED" as const,
  reviewedAt: requestedAt,
  reviewReference: "review/fixture-replay/v1",
  limitations: [],
}));

function readiness(
  providerId: string,
  datasetId: string,
  datasetVersion: string,
  requiredCapabilities: readonly ProviderCapabilityRequirement[],
) {
  return evaluateM5ProviderReadinessConfig({
    config: {
      configVersion: "m5-provider-readiness-config/v1",
      providerNamespace: `${providerId}:synthetic`,
      providerId,
      datasetId,
      datasetVersion,
      reviewedAt: requestedAt,
      reviewReference: "review/fixture-replay/v1",
      documentationUrls: ["https://example.test/docs"],
      termsUrls: ["https://example.test/terms"],
      capabilities: requiredCapabilities.map(item => ({
        capability: item.capability as M5ProviderCapability,
        status: "SUPPORTED" as const,
        completeness: "COMPLETE" as const,
        reviewedAt: requestedAt,
        reviewReference: "review/fixture-replay/v1",
        documentationUrls: ["https://example.test/docs"],
        termsUrls: ["https://example.test/terms"],
        limitations: [],
      })),
      usageDecisions,
      limitations: [],
      approvalExpiresAt: "2027-01-01T00:00:00.000Z",
      metadata: { sourceKind: "SYNTHETIC_FIXTURE", policyVersion: "m5-provider-readiness-policy/v1" },
    },
    evaluatedAt: receiptAt,
    requiredCapabilities,
    requestedUsages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"],
  });
}

function dailyRows(kind: "prices" | "marketCaps" | "totalVolumes") {
  return Array.from({ length: 15 }, (_, index) => {
    const timestamp = Date.UTC(2026, 0, index + 1);
    const value = kind === "prices" ? `${100 + index}.01` : kind === "marketCaps" ? `${1_000_000 + index}.01` : `${10_000 + index}.01`;
    return { timestamp, price: value, marketCap: kind === "marketCaps" ? value : null, volume: null };
  });
}

function coinGeckoBody(receivedAt = receiptAt, overrides: Record<string, unknown> = {}) {
  return {
    providerId: "coingecko",
    datasetId: "coingecko-market-chart",
    datasetVersion: "coingecko-market-chart/v1",
    network: "eth",
    contractAddress,
    coinId: "synthetic-asset",
    receipt: { receivedAt, pages: [{ pageOrdinal: 0, receivedAt }] },
    prices: dailyRows("prices"),
    marketCaps: dailyRows("marketCaps"),
    totalVolumes: dailyRows("totalVolumes"),
    pools: [],
    ...overrides,
  };
}

function etherscanBody() {
  return {
    providerId: "etherscan",
    datasetId: "etherscan-contract-authority",
    datasetVersion: "etherscan-api-v2/v1",
    chainid: "1",
    address: contractAddress,
    receipt: { receivedAt: receiptAt },
    creation: { blockNumber: "19000000", blockHash: `0x${"a".repeat(64)}`, timestamp: Date.UTC(2025, 0, 1) },
    sourceCode: { status: "VERIFIED", proxy: false },
    apiStatus: "1",
    apiMessage: "OK",
  };
}

function etherscanBodyWith(overrides: Record<string, unknown> = {}) {
  return { ...etherscanBody(), ...overrides };
}

function transport(body: unknown, retrievedAt = receiptAt, send = vi.fn()): M5ProviderHttpTransport {
  return {
    send: async request => {
      send(request);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body)),
        retrievedAt,
        providerRequestId: "synthetic-request-id",
      };
    },
  };
}

const noCredentials = { resolve: async () => ({ kind: "NONE" as const }) };
const coinGeckoCapabilities = [
  { capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" },
  { capability: "MARKET_CAP", completeness: "COMPLETE" },
  { capability: "VOLUME_24H", completeness: "COMPLETE" },
] as const;
const etherscanCapabilities = [{ capability: "CONTRACT_VERIFICATION", completeness: "COMPLETE" }] as const;

describe("M5 provider fixture replay integration", () => {
  it("executes CoinGecko fixture bytes through the boundary into a deterministic ingestion dry-run", async () => {
    const send = vi.fn();
    const result = await executeM5CoinGeckoFixtureReplay({
      coinId: "synthetic-asset",
      contractAddress,
      from: "2026-01-01T00:00:00.000Z",
      to: receiptAt,
      idempotencyKey: "coingecko-fixture-replay",
      requestedAt,
      startedAt: requestedAt,
      recordedAt,
      credential: { kind: "NONE", reference: "fixture-none" },
      readiness: readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", coinGeckoCapabilities),
      transport: transport(coinGeckoBody(), receiptAt, send),
      credentials: noCredentials,
      now: () => receiptAt,
    });

    expect(result.status).toBe("DRY_RUN_READY");
    if (result.status !== "DRY_RUN_READY") return;
    expect(result.normalizedPackage.records).toHaveLength(15);
    expect(result.ingestionPlan.memberCount).toBe(15);
    expect(result.ingestionPlan.sourceLineageId).toMatch(/^m5-source-lineage:[a-f0-9]{64}$/);
    expect(result.execution.receipt.receivedAt).toBe(receiptAt);
    expect(result.execution).not.toHaveProperty("body");
    expect(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value)).not.toMatch(/credential|rawPayload|authorization/i);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].request).toMatchObject({ protocol: "https:", hostname: "pro-api.coingecko.com", method: "GET" });
  });

  it("executes Etherscan fixture bytes through the same boundary and preserves exact scope", async () => {
    const result = await executeM5EtherscanFixtureReplay({
      contractAddress,
      idempotencyKey: "etherscan-fixture-replay",
      requestedAt,
      startedAt: requestedAt,
      recordedAt,
      credential: { kind: "NONE", reference: "fixture-none" },
      readiness: readiness("etherscan", "etherscan-contract-authority", "etherscan-api-v2/v1", etherscanCapabilities),
      transport: transport(etherscanBody()),
      credentials: noCredentials,
      now: () => receiptAt,
    });

    expect(result.status).toBe("DRY_RUN_READY");
    if (result.status !== "DRY_RUN_READY") return;
    expect(result.normalizedPackage.records.map(record => record.normalizedEnvelope.observationType)).toEqual(["CONTRACT_CREATION", "CONTRACT_VERIFICATION"]);
    expect(result.execution.scope).toEqual({ providerId: "etherscan", datasetId: "etherscan-contract-authority", datasetVersion: "etherscan-api-v2/v1" });
    expect(result.ingestionPlan.memberCount).toBe(2);
  });

  it("keeps payload identity stable when only the transport receipt changes", async () => {
    const first = await executeM5CoinGeckoFixtureReplay({
      coinId: "synthetic-asset", contractAddress, from: "2026-01-01T00:00:00.000Z", to: receiptAt,
      idempotencyKey: "receipt-layering", requestedAt, startedAt: requestedAt, recordedAt,
      credential: { kind: "NONE", reference: "fixture-none" },
      readiness: readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", coinGeckoCapabilities),
      transport: transport(coinGeckoBody()), credentials: noCredentials, now: () => receiptAt,
    });
    const laterReceipt = "2026-02-01T00:05:00.000Z";
    const second = await executeM5CoinGeckoFixtureReplay({
      coinId: "synthetic-asset", contractAddress, from: "2026-01-01T00:00:00.000Z", to: receiptAt,
      idempotencyKey: "receipt-layering", requestedAt, startedAt: requestedAt, recordedAt: "2026-02-01T00:05:01.000Z",
      credential: { kind: "NONE", reference: "fixture-none" },
      readiness: readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", coinGeckoCapabilities),
      transport: transport(coinGeckoBody(laterReceipt), laterReceipt), credentials: noCredentials, now: () => laterReceipt,
    });

    expect(first.status).toBe("DRY_RUN_READY");
    expect(second.status).toBe("DRY_RUN_READY");
    if (first.status !== "DRY_RUN_READY" || second.status !== "DRY_RUN_READY") return;
    expect(second.execution.payloadFingerprint).toBe(first.execution.payloadFingerprint);
    expect(second.normalizedPackage.records.map(record => record.payloadFingerprint)).toEqual(first.normalizedPackage.records.map(record => record.payloadFingerprint));
    expect(second.ingestionPlan.records.map(record => record.artifact.sourceArtifactId)).toEqual(first.ingestionPlan.records.map(record => record.artifact.sourceArtifactId));
    expect(second.ingestionPlan.sourceLineageId).toBe(first.ingestionPlan.sourceLineageId);
    expect(second.ingestionPlan.sourceLineageFingerprint).not.toBe(first.ingestionPlan.sourceLineageFingerprint);
  });

  it("blocks before transport when readiness is not authentic and READY", async () => {
    const send = vi.fn();
    const result = await executeM5CoinGeckoFixtureReplay({
      coinId: "synthetic-asset", contractAddress, from: "2026-01-01T00:00:00.000Z", to: receiptAt,
      idempotencyKey: "blocked-replay", requestedAt, startedAt: requestedAt, recordedAt,
      credential: { kind: "NONE", reference: "fixture-none" },
      readiness: { ...readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", coinGeckoCapabilities) },
      transport: transport(coinGeckoBody(), receiptAt, send), credentials: noCredentials,
    });

    expect(result).toEqual({ status: "BLOCKED", code: "M5_PROVIDER_READINESS_BLOCKED" });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects receipt, scope and JSON tampering inside the parser boundary", async () => {
    const common = {
      coinId: "synthetic-asset", contractAddress, from: "2026-01-01T00:00:00.000Z", to: receiptAt,
      idempotencyKey: "invalid-replay", requestedAt, startedAt: requestedAt, recordedAt,
      credential: { kind: "NONE" as const, reference: "fixture-none" },
      readiness: readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", coinGeckoCapabilities),
      credentials: noCredentials,
    };
    await expect(executeM5CoinGeckoFixtureReplay({ ...common, transport: transport(coinGeckoBody("2026-02-01T00:00:01.000Z")) })).rejects.toThrow("M5_PROVIDER_EXECUTION_PARSER_FAILED");
    await expect(executeM5CoinGeckoFixtureReplay({ ...common, transport: transport(coinGeckoBody(receiptAt, { contractAddress: "0x1111111111111111111111111111111111111111" })) })).rejects.toThrow("M5_PROVIDER_EXECUTION_PARSER_FAILED");
    await expect(executeM5CoinGeckoFixtureReplay({ ...common, transport: transport("{") })).rejects.toThrow("M5_PROVIDER_EXECUTION_PARSER_FAILED");
  });

  it("rejects non-plain objects, symbols, unknown fields, and secret-like keys in strict parsers", () => {
    expect(() => parseCoinGeckoFixture(Object.assign(Object.create({ inherited: true }), coinGeckoBody()))).toThrow();
    const symbolFixture = coinGeckoBody();
    Object.defineProperty(symbolFixture, Symbol("hidden"), { value: "secret" });
    expect(() => parseCoinGeckoFixture(symbolFixture)).toThrow();
    expect(() => parseCoinGeckoFixture(coinGeckoBody(receiptAt, { accessToken: "do-not-echo" }))).toThrow();
    expect(() => parseEtherscanFixture(etherscanBodyWith({ unexpected: "value" }))).toThrow();
  });

  it("fails closed on Etherscan address, chain, dataset/version, receipt, and future timestamps", async () => {
    const common = {
      contractAddress, idempotencyKey: "etherscan-invalid", requestedAt, startedAt: requestedAt, recordedAt,
      credential: { kind: "NONE" as const, reference: "fixture-none" },
      readiness: readiness("etherscan", "etherscan-contract-authority", "etherscan-api-v2/v1", etherscanCapabilities),
      credentials: noCredentials,
    };
    for (const body of [
      etherscanBodyWith({ address: "0x1111111111111111111111111111111111111111" }),
      etherscanBodyWith({ chainid: "5" }),
      etherscanBodyWith({ datasetId: "other" }),
      etherscanBodyWith({ datasetVersion: "other/v2" }),
      etherscanBodyWith({ receipt: { receivedAt: "2026-02-01T00:00:02.000Z" } }),
      etherscanBodyWith({ receipt: { receivedAt: "2026-02-01T00:00:00.000Z", providerPublishedAt: "2026-02-01T00:00:01.000Z" } }),
    ]) {
      await expect(executeM5EtherscanFixtureReplay({ ...common, transport: transport(body) })).rejects.toThrow("M5_PROVIDER_EXECUTION_PARSER_FAILED");
    }
  });

  it("keeps Etherscan content fingerprints stable across receipt changes and changes them for semantic changes", async () => {
    const base = etherscanBody();
    const later = { ...base, receipt: { receivedAt: "2026-02-01T00:05:00.000Z" } };
    expect(parseEtherscanFixture(base).payloadFingerprint).toBe(parseEtherscanFixture(later).payloadFingerprint);
    for (const changed of [
      { ...base, creation: { ...base.creation, blockNumber: "19000001" } },
      { ...base, creation: { ...base.creation, blockHash: `0x${"b".repeat(64)}` } },
      { ...base, sourceCode: { status: "UNVERIFIED", proxy: false } },
      { ...base, datasetVersion: "etherscan-api-v2/v2" },
      { ...base, address: "0x1111111111111111111111111111111111111111" },
    ]) expect(parseEtherscanFixture(changed).payloadFingerprint).not.toBe(parseEtherscanFixture(base).payloadFingerprint);
  });

  it("produces deeply immutable results and never exposes raw bytes or credential material", async () => {
    const result = await executeM5CoinGeckoFixtureReplay({
      coinId: "synthetic-asset", contractAddress, from: "2026-01-01T00:00:00.000Z", to: receiptAt,
      idempotencyKey: "immutable-replay", requestedAt, startedAt: requestedAt, recordedAt,
      credential: { kind: "NONE", reference: "fixture-none" },
      readiness: readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", coinGeckoCapabilities),
      transport: transport(coinGeckoBody()), credentials: noCredentials, now: () => receiptAt,
    });
    expect(result.status).toBe("DRY_RUN_READY");
    if (result.status !== "DRY_RUN_READY") return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.normalizedPackage.records)).toBe(true);
    expect(Object.isFrozen(result.normalizedPackage.records[0])).toBe(true);
    expect(Object.isFrozen(result.normalizedPackage.records[0]?.normalizedEnvelope)).toBe(true);
    const serialized = JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value);
    expect(serialized).not.toContain("rawPayload");
    expect(serialized).not.toContain("do-not-echo");
    expect(serialized).not.toContain("body");
    expect(result).not.toHaveProperty("apply");
    expect(result).not.toHaveProperty("persist");
    const envelope = result.ingestionPlan.records[0]?.envelope;
    expect(envelope).toBeDefined();
    if (envelope) {
      expect(() => assertSourceEnvelope({ ...envelope, selectedAuditableFields: { ...envelope.selectedAuditableFields, metric: "TAMPERED" } })).toThrow("M5_SOURCE_ENVELOPE_FINGERPRINT_MISMATCH");
    }
  });
});
