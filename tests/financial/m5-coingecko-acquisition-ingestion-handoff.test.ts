import { describe, expect, it, vi } from "vitest";
import { parseM5NormalizedSourcePackage } from "@/application/intelligence/parse-m5-normalized-source-package";
import { parseM5LiveCoinGeckoResponse } from "@/application/intelligence/m5-provider-live-acquisition";
import type { ManualIngestionToLineageUnitOfWork } from "@/application/intelligence/manual-ingestion-to-lineage-uow";

const at = "2026-09-29T14:02:00.000Z";
const later = "2026-09-29T14:03:00.000Z";
const address = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const fingerprint = "a".repeat(64);
const scope = Object.freeze({ providerId: "coingecko" as const, datasetId: "coingecko-market-chart" as const, datasetVersion: "coingecko-market-chart/range-v1" as const, chain: "ethereum" as const, contractAddress: address, endpointProfile: "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_PRO" as const, endpointHostname: "pro-api.coingecko.com" as const, endpointPath: `/api/v3/coins/ethereum/contract/${address}/market_chart/range`, canonicalQueryFingerprint: "f".repeat(64), requestPlanFingerprint: "b".repeat(64), approvalAuthorityId: "m5-provider-approval:coingecko", approvalAuthorityFingerprint: "c".repeat(64), parserContractVersion: "m5-provider-parser/v1", payloadFingerprint: fingerprint });
const normalizedPackage = () => parseM5NormalizedSourcePackage({ contractVersion: "m5-normalized-source-package/v1", idempotencyKey: "m5-acquisition-handoff-test", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", providerSourceNamespace: "COINGECKO", adapterContractVersion: "m5-provider-adapter/v1", adapterVersion: "m5-provider-adapter/v1", parserContractVersion: "m5-provider-parser/v1", parserVersion: "m5-provider-parser/v1", envelopeSchemaVersion: "m5-provider-envelope/v1", attemptNumber: 1, requestedAt: at, startedAt: at, recordedAt: at, requestScope: { network: "eth", contractAddress: address, coinId: "ethereum" }, provenance: { system: "test" }, executionInput: { endpointPath: "https://pro-api.coingecko.com/api/v3/coins/ethereum/contract/{address}/market_chart/range", interval: "daily" }, records: [{ providerExternalRecordId: "ethereum:daily:2026-09-28", providerRevision: fingerprint, payloadFingerprint: fingerprint, pageOrdinal: 0, itemOrdinal: 0, retrievedAt: at, recordedAt: at, observedAt: "2026-09-28T00:00:00.000Z", normalizedEnvelope: { closeValueAtoms: "9007199254740993", priceScale: 0 }, selectedAuditableFields: { metric: "DAILY_MARKET_DATA" }, metadata: { cursorSafety: "NONE" } }] });
const candidate = () => Object.freeze({ status: "READY" as const, scope: { providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1" }, asOf: at, planFingerprints: [scope.requestPlanFingerprint], executions: [{ status: "EXECUTED" as const, planFingerprint: scope.requestPlanFingerprint, scope: { providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1" }, receipt: { providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", planFingerprint: scope.requestPlanFingerprint, receivedAt: at, effectiveAvailableAt: at, attemptCount: 1 }, payloadFingerprint: fingerprint, projection: {} }], payloadFingerprint: fingerprint, normalizedPackage: normalizedPackage(), ingestionHandoffBinding: scope });

describe("M5 CoinGecko acquisition ingestion handoff", () => {
  it("blocks smoke, copied, serialized, and fabricated inputs before any UoW or manual parser write path", async () => {
    vi.resetModules();
    const { executeM5CoinGeckoAcquisitionIngestionHandoff } = await import("@/application/intelligence/m5-coingecko-acquisition-ingestion-handoff");
    const uow = { withTransaction: vi.fn() };
    const smoke = { status: "VERIFIED", authorityStatus: "NON_AUTHORITATIVE_SMOKE", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", rawBody: "never-expose-this" };
    for (const acquisition of [smoke, candidate(), JSON.parse(JSON.stringify(candidate())), { ...candidate(), status: "READY" }]) {
      const result = await executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition, asOf: at, scope, apply: true, unitOfWork: uow as unknown as ManualIngestionToLineageUnitOfWork });
      expect(result).toEqual({ status: "BLOCKED", code: "M5_ACQUISITION_HANDOFF_UNTRUSTED_ACQUISITION" });
      expect(JSON.stringify(result)).not.toContain("never-expose-this");
    }
    expect(uow.withTransaction).not.toHaveBeenCalled();
  });

  it("projects only exact, trusted production material and preserves manual-ingestion dry-run identity", async () => {
    const authentic = candidate();
    vi.resetModules();
    vi.doMock("@/application/intelligence/m5-provider-live-acquisition", async () => {
      const actual = await vi.importActual<typeof import("@/application/intelligence/m5-provider-live-acquisition")>("@/application/intelligence/m5-provider-live-acquisition");
      return { ...actual, isTrustedM5ProviderLiveAcquisitionForIngestion: (value: unknown) => value === authentic };
    });
    const { executeM5CoinGeckoAcquisitionIngestionHandoff } = await import("@/application/intelligence/m5-coingecko-acquisition-ingestion-handoff");
    const first = await executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: authentic, asOf: at, scope, apply: false });
    const second = await executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: authentic, asOf: at, scope, apply: false });
    expect(first.status).toBe("READY");
    expect(second).toEqual(first);
    expect(Object.isFrozen(authentic.normalizedPackage)).toBe(true);
    if (first.status === "READY" && first.ingestion.status === "DRY_RUN_READY") expect(first.ingestion.plan.records[0]!.envelope.normalizedEnvelope.closeValueAtoms).toBe("9007199254740993");
    const databaseFailure = new Error("database unavailable");
    await expect(executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: authentic, asOf: at, scope, apply: true, unitOfWork: { withTransaction: async () => { throw databaseFailure; } } as unknown as import("@/application/intelligence/manual-ingestion-to-lineage-uow").ManualIngestionToLineageUnitOfWork })).rejects.toBe(databaseFailure);
  });

  it("fails closed on every bound authority, scope, parser, request, fingerprint, and as-of mismatch", async () => {
    const authentic = candidate();
    vi.resetModules();
    vi.doMock("@/application/intelligence/m5-provider-live-acquisition", () => ({ isTrustedM5ProviderLiveAcquisitionForIngestion: (value: unknown) => value === authentic }));
    const { executeM5CoinGeckoAcquisitionIngestionHandoff } = await import("@/application/intelligence/m5-coingecko-acquisition-ingestion-handoff");
    const changes = [{ providerId: "other" }, { datasetId: "other" }, { datasetVersion: "v2" }, { chain: "other" }, { approvalAuthorityId: "other" }, { approvalAuthorityFingerprint: "d".repeat(64) }, { parserContractVersion: "parser/v2" }, { requestPlanFingerprint: "e".repeat(64) }, { canonicalQueryFingerprint: "0".repeat(64) }, { endpointHostname: "api.coingecko.com" }, { endpointPath: "/other" }, { endpointProfile: "COINGECKO_DEMO" }, { payloadFingerprint: "1".repeat(64) }, { contractAddress: "0x1111111111111111111111111111111111111111" }];
    const uow = { withTransaction: vi.fn() };
    for (const change of changes) {
      const result = await executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: authentic, asOf: at, scope: { ...scope, ...change } as unknown as typeof scope, apply: true, unitOfWork: uow as unknown as ManualIngestionToLineageUnitOfWork });
      expect(result).toEqual({ status: "BLOCKED", code: "M5_ACQUISITION_HANDOFF_SCOPE_MISMATCH" });
    }
    await expect(executeM5CoinGeckoAcquisitionIngestionHandoff({ acquisition: authentic, asOf: later, scope, apply: true, unitOfWork: uow as unknown as ManualIngestionToLineageUnitOfWork })).resolves.toEqual({ status: "INCOMPLETE", code: "M5_ACQUISITION_HANDOFF_AS_OF_MISMATCH" });
    expect(uow.withTransaction).not.toHaveBeenCalled();
  });

  it("keeps provider payload identity independent of receipt while changing payload changes identity", () => {
    const body = (value: string) => new TextEncoder().encode(value);
    const source = '{"prices":[[1767225600000,9007199254740993]],"market_caps":[[1767225600000,1]],"total_volumes":[[1767225600000,2]]}';
    const first = parseM5LiveCoinGeckoResponse({ body: body(source), coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: at });
    const receiptChanged = parseM5LiveCoinGeckoResponse({ body: body(source), coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: later });
    const payloadChanged = parseM5LiveCoinGeckoResponse({ body: body(source.replace(",2]]}", ",3]]}")), coinId: "ethereum", contractAddress: address, datasetVersion: "coingecko-market-chart/range-v1", retrievedAt: at });
    expect(receiptChanged.payloadFingerprint).toBe(first.payloadFingerprint);
    expect(payloadChanged.payloadFingerprint).not.toBe(first.payloadFingerprint);
  });
});
