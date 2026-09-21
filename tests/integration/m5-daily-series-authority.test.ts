import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { parseCoinGeckoFixture, projectCoinGeckoToNormalizedPackage } from "@/application/intelligence/m5-provider-adapter-contracts";
import { executeManualIngestionToLineage, buildManualIngestionToLineagePlan } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createM5DailySeriesAuthorityPersistenceUnitOfWork } from "@/infrastructure/postgres/m5-daily-series-authority-repository";
import { persistM5DailySeriesAuthority, type M5DailySeriesAuthorityRepositories, type M5DailySeriesAuthorityUnitOfWork } from "@/application/intelligence/m5-daily-series-authority-persistence";
import { createProviderAssetIdentityAssertionAuthority } from "@/application/intelligence/create-provider-asset-identity-assertion";
import { createProviderAssetIdentityAssertionUnitOfWork } from "@/infrastructure/postgres/provider-asset-identity-repository";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createAssetMappingSourceLineageUnitOfWork } from "@/infrastructure/postgres/asset-mapping-revision-repository";
import { persistM5DailySeriesEvidence } from "@/application/intelligence/m5-daily-series-evidence";
import { createM5DailySeriesEvidenceUnitOfWork } from "@/infrastructure/postgres/m5-daily-series-evidence-uow";

const url = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_DAILY_SERIES_INTEGRATION === "1" && process.env.MONEY_MACHINE_DAILY_SERIES_SCHEMA_READY === "1" && Boolean(url);
function assertLocal(value: string): void { const host = new URL(value).hostname; if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("M5_DAILY_INTEGRATION_REQUIRES_LOOPBACK"); }
function fixture() {
  const receipt = "2026-02-01T00:00:00.000Z";
  const prices = [100n, 200n, 400n, 800n, 1600n, 3200n, 6400n, 12800n, 25600n, 51200n, 102400n, 204800n, 409600n, 819200n, 2457600n].map(v => v * 1_000_000_000_000n);
  const rows = (kind: "prices" | "marketCaps" | "totalVolumes") => prices.map((_, index) => ({ timestamp: Date.UTC(2026, 0, index + 1), price: kind === "prices" ? prices[index]!.toString() : "1000.00", marketCap: null, volume: null }));
  return { providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/v1", network: "eth", contractAddress: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01", coinId: "synthetic-daily-authority", receipt: { receivedAt: receipt, pages: [{ pageOrdinal: 0, receivedAt: receipt }] }, prices: rows("prices"), marketCaps: rows("marketCaps"), totalVolumes: rows("totalVolumes"), pools: [] };
}

describe.skipIf(!enabled)("M5 daily series authority PostgreSQL integration", () => {
  it("ingests, persists, rereads, replays and rolls back a fifteen-point authority", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 1, prepare: true });
    try {
      const providerId = "coingecko"; const datasetId = "coingecko-market-chart"; const datasetVersion = "coingecko-market-chart/v1";
      await sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values (${providerId},${providerId},'SYNTHETIC_FIXTURE','local-test','provenance/v1','METADATA_ONLY') on conflict do nothing`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values (${datasetId},${providerId},${datasetVersion},'synthetic daily fixture','METADATA_ONLY') on conflict do nothing`;
      const parsed = parseCoinGeckoFixture({ ...fixture(), datasetId, datasetVersion });
      const pkg = projectCoinGeckoToNormalizedPackage({ fixture: parsed, idempotencyKey: "daily-authority-v1", requestedAt: "2026-02-01T00:00:00.000Z", startedAt: "2026-02-01T00:00:01.000Z", recordedAt: "2026-02-01T00:10:00.000Z" });
      const ingested = await executeManualIngestionToLineage(pkg, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) });
      expect(ingested.status).toBe("PERSISTED"); if (ingested.status !== "PERSISTED") return;
      const plan = buildManualIngestionToLineagePlan(pkg);
      const observations = plan.records.map((record, ordinal) => ({ ordinal, observationId: record.artifact.providerExternalRecordId, sourceArtifactId: record.artifact.sourceArtifactId, sourceEnvelopeId: record.envelope.sourceEnvelopeId, sourceObservationId: record.observation.sourceObservationId, providerExternalRecordId: record.artifact.providerExternalRecordId, payloadFingerprint: record.artifact.payloadFingerprint, observedAt: record.envelope.observedAt, availableAt: record.observation.retrievedAt, closeValue: BigInt(String((record.envelope.normalizedEnvelope as Record<string, unknown>).closeValueAtoms)), priceScale: Number((record.envelope.normalizedEnvelope as Record<string, unknown>).priceScale), quoteUnit: String((record.envelope.normalizedEnvelope as Record<string, unknown>).quoteUnit) }));
      const input = { providerId, datasetId, datasetVersion, providerSourceNamespace: pkg.providerSourceNamespace, chainId: "eip155:1", contractAddress: parsed.contractAddress, providerAssetIdentity: plan.records[0]!.artifact.providerExternalRecordId, observations, sourceLineageId: ingested.sourceLineageId, asOf: "2026-02-02T00:00:00.000Z", recordedAt: "2026-02-02T00:01:00.000Z" } as const;
      const uow = createM5DailySeriesAuthorityPersistenceUnitOfWork(sql);
      const first = await persistM5DailySeriesAuthority({ ...input, unitOfWork: uow });
      expect(first.status).toBe("PERSISTED"); if (first.status !== "PERSISTED") return;
      expect(first.aggregate.authority.observationCount).toBe(15); expect(first.aggregate.historySpan.value).toBe(14n); expect(first.aggregate.volatility.value).toBe(2575n);
      const counts = async () => (await sql`select (select count(*) from public.intelligence_m5_daily_series_authorities)::int as parents,(select count(*) from public.intelligence_m5_daily_series_observations)::int as observations,(select count(*) from public.intelligence_m5_daily_series_derivations)::int as derivations`)[0];
      expect(await counts()).toEqual({ parents: 1, observations: 15, derivations: 2 });
      const identityRecord = plan.records[0]!;
      const assertion = await createProviderAssetIdentityAssertionAuthority({ unitOfWork: createProviderAssetIdentityAssertionUnitOfWork(sql), projection: { projectionVersion: "m5-provider-asset-identity-projection/v1", sourceArtifactId: identityRecord.artifact.sourceArtifactId, sourceEnvelopeId: identityRecord.envelope.sourceEnvelopeId, parserVersion: pkg.parserContractVersion, envelopeSchemaVersion: pkg.envelopeSchemaVersion, identity: { type: "EVM_CONTRACT_ADDRESS", namespace: "eip155:1", value: parsed.contractAddress }, diagnostics: [] }, recordedAt: "2026-02-02T00:00:00.000Z" });
      const mapping = await createAssetMappingRevisionFromSourceLineage({ unitOfWork: createAssetMappingSourceLineageUnitOfWork(sql), value: { sourceLineageId: ingested.sourceLineageId, providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, canonicalAssetId: "canonical-daily", canonicalIdentifier: "asset:daily", assetClass: "CRYPTO", mappingRevisionVersion: "mapping/v1", validFrom: "2025-01-01T00:00:00.000Z", recordedAt: "2026-02-02T00:00:00.000Z" } });
      const evidenceAuthority = first;
      const evidenceUow = createM5DailySeriesEvidenceUnitOfWork(sql);
      const evidence = await persistM5DailySeriesEvidence({ unitOfWork: evidenceUow, mappingRevisionId: mapping.mappingRevisionId, authorityId: evidenceAuthority.aggregate.authority.authorityId, candidateId: "candidate-daily" });
      expect(evidence.status).toBe("PERSISTED"); if (evidence.status !== "PERSISTED") return;
      expect(evidence.evidence.map(row => row.metricKind)).toEqual(["HISTORY_SPAN", "VOLATILITY"]);
      expect(evidence.evidence.map(row => row.valueAtoms)).toEqual([14n, 2575n]);
      expect((await sql`select count(*)::int as count from public.eligibility_quantitative_evidence`)[0]!.count).toBe(2);
      const evidenceReplay = await persistM5DailySeriesEvidence({ unitOfWork: evidenceUow, mappingRevisionId: mapping.mappingRevisionId, authorityId: evidenceAuthority.aggregate.authority.authorityId, candidateId: "candidate-daily" });
      expect(evidenceReplay.status).toBe("PERSISTED"); expect((await sql`select count(*)::int as count from public.eligibility_quantitative_evidence`)[0]!.count).toBe(2);
      const replay = await persistM5DailySeriesAuthority({ ...input, unitOfWork: uow }); expect(replay.status).toBe("PERSISTED"); expect(await counts()).toEqual({ parents: 1, observations: 15, derivations: 2 });
      const databaseFailureUow: M5DailySeriesAuthorityUnitOfWork = { withTransaction: <T>(work: (repositories: M5DailySeriesAuthorityRepositories) => Promise<T>) => uow.withTransaction(async repositories => work({ ...repositories, dailySeries: { ...repositories.dailySeries, save: async () => { throw new Error("M5_TEST_DATABASE_FAILURE"); } } })) };
      await expect(persistM5DailySeriesAuthority({ ...input, unitOfWork: databaseFailureUow })).rejects.toThrow("M5_TEST_DATABASE_FAILURE");
      expect(await counts()).toEqual({ parents: 1, observations: 15, derivations: 2 });
      const rollbackUow: M5DailySeriesAuthorityUnitOfWork = { withTransaction: <T>(work: (repositories: M5DailySeriesAuthorityRepositories) => Promise<T>) => uow.withTransaction(async repositories => { await work(repositories); throw new Error("M5_TEST_DAILY_ROLLBACK_SENTINEL"); }) };
      const freshInput = { ...input, asOf: "2026-02-03T00:00:00.000Z", sourceLineageId: ingested.sourceLineageId, recordedAt: "2026-02-02T00:02:00.000Z" };
      await expect(persistM5DailySeriesAuthority({ ...freshInput, unitOfWork: rollbackUow })).rejects.toThrow("M5_TEST_DAILY_ROLLBACK_SENTINEL");
      expect(await counts()).toEqual({ parents: 1, observations: 15, derivations: 2 });
      const missing = await persistM5DailySeriesAuthority({ ...input, sourceLineageId: "missing-lineage", unitOfWork: uow }); expect(missing.status).toBe("INCOMPLETE");
    } finally { await sql.end({ timeout: 5 }); }
  });
});
