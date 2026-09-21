import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { executeManualIngestionToLineage, buildManualIngestionToLineagePlan } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createM5MarketMetricsAuthorityPersistenceUnitOfWork } from "@/infrastructure/postgres/m5-market-metrics-authority-repository";
import { persistM5MarketMetricsAuthority } from "@/application/intelligence/m5-market-metrics-authority-persistence";
import { createM5MarketMetricsEvidenceUnitOfWork } from "@/infrastructure/postgres/m5-market-metrics-authority-repository";
import { persistM5MarketMetricsEvidence, type M5MarketMetricsEvidenceRepositories, type M5MarketMetricsEvidenceUnitOfWork } from "@/application/intelligence/m5-market-metrics-evidence";
import { createProviderAssetIdentityAssertionAuthority } from "@/application/intelligence/create-provider-asset-identity-assertion";
import { createProviderAssetIdentityAssertionUnitOfWork } from "@/infrastructure/postgres/provider-asset-identity-repository";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createAssetMappingSourceLineageUnitOfWork } from "@/infrastructure/postgres/asset-mapping-revision-repository";
import type { MarketSourceMaterial } from "@/domain/intelligence/m5-market-metrics-authority";

const url = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_MARKET_METRICS_INTEGRATION === "1" && process.env.MONEY_MACHINE_MARKET_METRICS_SCHEMA_READY === "1" && Boolean(url);
function assertLocal(value: string): void { const host = new URL(value).hostname; if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("M5_MARKET_INTEGRATION_REQUIRES_LOOPBACK"); }

// Source scale 18 converts to MINOR scale 2 by dividing by 10^16.
// The factor keeps every source atom above Number.MAX_SAFE_INTEGER while
// preserving the hand-specified MINOR results below.
const huge = 10n ** 16n;
const asOf = "2026-02-02T00:00:00.000Z";
const recordedAt = "2026-02-02T00:05:00.000Z";
const address = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

function packageFixture() {
  const records = [
    { id: "market:cap", kind: "MARKET_CAP", value: (15_000_000n * huge + 123n).toString(), basis: "MARKET_CAP_REPORTED" },
    { id: "market:volume", kind: "VOLUME", value: (750_000n * huge + 456n).toString(), basis: "ROLLING_24H_REPORTED", windowStart: "2026-02-01T00:00:00.000Z", windowEnd: "2026-02-01T23:59:59.000Z" },
    { id: "market:liquidity", kind: "LIQUIDITY", value: (1_250_000n * huge + 789n).toString(), basis: "COMPLETE_LIQUIDITY_UNIVERSE", coverageVersion: "universe/v1" },
  ].map((item, index) => {
    const observedAt = "2026-02-01T00:00:00.000Z";
    const retrievedAt = `2026-02-01T00:0${index + 1}:00.000Z`;
    const envelope = { provider: "synthetic-market", metricKind: item.kind, valueAtoms: item.value, sourceScale: 18, quoteCurrency: "USD", basis: item.basis, observedAt, ...(item.windowStart ? { windowStart: item.windowStart, windowEnd: item.windowEnd } : {}), ...(item.coverageVersion ? { coverageVersion: item.coverageVersion, componentAId: "pool-a", componentAAtoms: (750_000n * huge).toString(), componentBId: "pool-b", componentBAtoms: (500_000n * huge).toString(), componentScale: 18 } : {}) };
    const selected = { metric: item.kind, observedAt, receiptAt: retrievedAt };
    const providerRevision = "synthetic-market/v1";
    return { providerExternalRecordId: item.id, providerRevision, payloadFingerprint: canonicalSha256({ envelope, selected, providerRevision }), pageOrdinal: 0, itemOrdinal: index, retrievedAt, recordedAt, observedAt, normalizedEnvelope: envelope, selectedAuditableFields: selected, metadata: { pageOrdinal: 0, cursorSafety: "NONE", responseHostPath: "https://synthetic.invalid/market" } };
  });
  return { contractVersion: "m5-normalized-source-package/v1", idempotencyKey: "market-authority-runtime-v1", providerId: "synthetic-market", datasetId: "synthetic-market-metrics", datasetVersion: "synthetic-market-metrics/v1", providerSourceNamespace: "synthetic:market", adapterContractVersion: "synthetic-market-adapter/v1", adapterVersion: "synthetic-market-adapter/v1", parserContractVersion: "synthetic-market-parser/v1", parserVersion: "synthetic-market-parser/v1", envelopeSchemaVersion: "synthetic-market-envelope/v1", attemptNumber: 1, requestedAt: "2026-02-01T00:00:00.000Z", startedAt: "2026-02-01T00:00:01.000Z", recordedAt, requestScope: { contractAddress: address }, provenance: { system: "synthetic-fixture" }, executionInput: { fixture: "market-metrics" }, records };
}

describe.skipIf(!enabled)("M5 market metrics authority PostgreSQL integration", () => {
  it("runs the complete authority/evidence chain, replay, incomplete liquidity and rollback", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 1, prepare: true });
    try {
      await sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values ('synthetic-market','synthetic-market','SYNTHETIC_FIXTURE','local-test','provenance/v1','METADATA_ONLY') on conflict do nothing`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values ('synthetic-market-metrics','synthetic-market','synthetic-market-metrics/v1','synthetic market fixture','METADATA_ONLY') on conflict do nothing`;
      const plan = buildManualIngestionToLineagePlan(packageFixture());
      const ingested = await executeManualIngestionToLineage(plan.package, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) });
      expect(ingested.status).toBe("PERSISTED"); if (ingested.status !== "PERSISTED") return;
      expect(ingested.memberCount).toBe(3);
      const first = plan.records[0]!;
      const assertion = await createProviderAssetIdentityAssertionAuthority({ unitOfWork: createProviderAssetIdentityAssertionUnitOfWork(sql), projection: { projectionVersion: "m5-provider-asset-identity-projection/v1", sourceArtifactId: first.artifact.sourceArtifactId, sourceEnvelopeId: first.envelope.sourceEnvelopeId, parserVersion: plan.package.parserVersion, envelopeSchemaVersion: plan.package.envelopeSchemaVersion, identity: { type: "EVM_CONTRACT_ADDRESS", namespace: "eip155:1", value: address }, diagnostics: [] }, recordedAt });
      const mapping = await createAssetMappingRevisionFromSourceLineage({ unitOfWork: createAssetMappingSourceLineageUnitOfWork(sql), value: { sourceLineageId: ingested.sourceLineageId, providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, canonicalAssetId: "canonical-market", canonicalIdentifier: "asset:market", assetClass: "CRYPTO", mappingRevisionVersion: "mapping/v1", validFrom: "2025-01-01T00:00:00.000Z", recordedAt } });
      const base = (id: string, kind: MarketSourceMaterial["metricKind"], valueAtoms: bigint, basis: string): MarketSourceMaterial => { const record = plan.records.find(r => r.artifact.providerExternalRecordId === id)!; return { metricKind: kind, sourceArtifactId: record.artifact.sourceArtifactId, sourceEnvelopeId: record.envelope.sourceEnvelopeId, sourceObservationId: record.observation.sourceObservationId, providerExternalRecordId: id, payloadFingerprint: record.artifact.payloadFingerprint, valueAtoms, scale: 18, quoteCurrency: "USD", observedAt: record.envelope.observedAt, availableAt: record.observation.retrievedAt, basis, ...(kind === "VOLUME" ? { windowStart: "2026-02-01T00:00:00.000Z", windowEnd: "2026-02-01T23:59:59.000Z" } : {}), ...(kind === "LIQUIDITY" ? { coverageVersion: "universe/v1", componentIds: ["pool-a", "pool-b"], components: [{ id: "pool-a", valueAtoms: 750_000n * huge, scale: 18, quoteCurrency: "USD" }, { id: "pool-b", valueAtoms: 500_000n * huge, scale: 18, quoteCurrency: "USD" }] } : {}) }; };
      const materials = [base("market:cap", "MARKET_CAP", 15_000_000n * huge + 123n, "MARKET_CAP_REPORTED"), base("market:volume", "VOLUME", 750_000n * huge + 456n, "ROLLING_24H_REPORTED"), base("market:liquidity", "LIQUIDITY", 1_250_000n * huge + 789n, "COMPLETE_LIQUIDITY_UNIVERSE")];
      const authority = await persistM5MarketMetricsAuthority({ providerId: "synthetic-market", datasetId: "synthetic-market-metrics", datasetVersion: "synthetic-market-metrics/v1", sourceLineageId: ingested.sourceLineageId, asOf, quoteCurrency: "USD", materials, recordedAt, unitOfWork: createM5MarketMetricsAuthorityPersistenceUnitOfWork(sql) });
      expect(authority.status).toBe("PERSISTED"); if (authority.status !== "PERSISTED") return;
      expect(authority.aggregate.derivations.map(d => [d.metricKind, d.valueAtoms])).toEqual([["MARKET_CAP", 15_000_000n], ["VOLUME", 750_000n], ["LIQUIDITY", 1_250_000n]]);
      const evidenceUow = createM5MarketMetricsEvidenceUnitOfWork(sql);
      const evidence = await persistM5MarketMetricsEvidence({ unitOfWork: evidenceUow, mappingRevisionId: mapping.mappingRevisionId, authorityId: authority.aggregate.authority.authorityId, candidateId: "candidate-market" });
      expect(evidence.status).toBe("PERSISTED"); if (evidence.status !== "PERSISTED") return;
      expect(evidence.evidence.map(row => [row.metricKind, row.valueAtoms])).toEqual([["MARKET_CAP", 15_000_000n], ["VOLUME", 750_000n], ["LIQUIDITY", 1_250_000n]]);
      const counts = async () => (await sql`select (select count(*) from public.intelligence_m5_market_metric_authorities)::int as authorities,(select count(*) from public.intelligence_m5_market_metric_materials)::int as materials,(select count(*) from public.intelligence_m5_market_metric_derivations)::int as derivations,(select count(*) from public.eligibility_quantitative_evidence)::int as evidence`)[0];
      expect(await counts()).toEqual({ authorities: 1, materials: 3, derivations: 3, evidence: 3 });
      const replayAuthority = await persistM5MarketMetricsAuthority({ providerId: "synthetic-market", datasetId: "synthetic-market-metrics", datasetVersion: "synthetic-market-metrics/v1", sourceLineageId: ingested.sourceLineageId, asOf, quoteCurrency: "USD", materials, recordedAt: "2026-02-02T00:06:00.000Z", unitOfWork: createM5MarketMetricsAuthorityPersistenceUnitOfWork(sql) });
      expect(replayAuthority.status).toBe("PERSISTED");
      const replayEvidence = await persistM5MarketMetricsEvidence({ unitOfWork: evidenceUow, mappingRevisionId: mapping.mappingRevisionId, authorityId: authority.aggregate.authority.authorityId, candidateId: "candidate-market" });
      expect(replayEvidence.status).toBe("PERSISTED"); expect(await counts()).toEqual({ authorities: 1, materials: 3, derivations: 3, evidence: 3 });
      const rollbackAuthority = await persistM5MarketMetricsAuthority({ providerId: "synthetic-market", datasetId: "synthetic-market-metrics", datasetVersion: "synthetic-market-metrics/v1", sourceLineageId: ingested.sourceLineageId, asOf: "2026-02-04T00:00:00.000Z", quoteCurrency: "USD", materials, recordedAt: "2026-02-02T00:07:00.000Z", unitOfWork: createM5MarketMetricsAuthorityPersistenceUnitOfWork(sql) });
      expect(rollbackAuthority.status).toBe("PERSISTED"); if (rollbackAuthority.status !== "PERSISTED") return;
      const incomplete = await persistM5MarketMetricsAuthority({ providerId: "synthetic-market", datasetId: "synthetic-market-metrics", datasetVersion: "synthetic-market-metrics/v1", sourceLineageId: ingested.sourceLineageId, asOf: "2026-02-03T00:00:00.000Z", quoteCurrency: "USD", materials: materials.map(m => m.metricKind === "LIQUIDITY" ? { ...m, componentIds: ["pool-a"], components: [m.components![0]!] } : m), recordedAt, unitOfWork: createM5MarketMetricsAuthorityPersistenceUnitOfWork(sql) });
      expect(incomplete.status).toBe("INCOMPLETE"); expect(await counts()).toEqual({ authorities: 2, materials: 6, derivations: 6, evidence: 3 });
      const rollbackUow: M5MarketMetricsEvidenceUnitOfWork = { withTransaction: <T>(work: (repositories: M5MarketMetricsEvidenceRepositories) => Promise<T>) => evidenceUow.withTransaction(async repositories => { const result = await work(repositories); throw new Error("M5_TEST_MARKET_EVIDENCE_ROLLBACK_SENTINEL"); return result; }) };
      await expect(persistM5MarketMetricsEvidence({ unitOfWork: rollbackUow, mappingRevisionId: mapping.mappingRevisionId, authorityId: rollbackAuthority.aggregate.authority.authorityId, candidateId: "candidate-rollback" })).rejects.toThrow("M5_TEST_MARKET_EVIDENCE_ROLLBACK_SENTINEL");
      expect(await counts()).toEqual({ authorities: 2, materials: 6, derivations: 6, evidence: 3 });
      const failureUow: M5MarketMetricsEvidenceUnitOfWork = { withTransaction: <T>(work: (repositories: M5MarketMetricsEvidenceRepositories) => Promise<T>) => evidenceUow.withTransaction(async repositories => { let writes = 0; return work({ ...repositories, evidence: { save: async row => { writes += 1; if (writes === 2) throw new Error("M5_TEST_MARKET_DATABASE_FAILURE"); return repositories.evidence.save(row); } } }); }) };
      await expect(persistM5MarketMetricsEvidence({ unitOfWork: failureUow, mappingRevisionId: mapping.mappingRevisionId, authorityId: rollbackAuthority.aggregate.authority.authorityId, candidateId: "candidate-failure" })).rejects.toThrow("M5_TEST_MARKET_DATABASE_FAILURE");
      expect(await counts()).toEqual({ authorities: 2, materials: 6, derivations: 6, evidence: 3 });
    } finally { await sql.end({ timeout: 5 }); }
  });
});
