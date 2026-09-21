import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { buildManualIngestionToLineagePlan, executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createProviderAssetIdentityAssertionAuthority } from "@/application/intelligence/create-provider-asset-identity-assertion";
import { createProviderAssetIdentityAssertionUnitOfWork } from "@/infrastructure/postgres/provider-asset-identity-repository";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createAssetMappingSourceLineageUnitOfWork } from "@/infrastructure/postgres/asset-mapping-revision-repository";
import { persistM5VenueAuthority } from "@/application/intelligence/m5-venue-authority-persistence";
import { persistM5VenueEvidence } from "@/application/intelligence/m5-venue-evidence";
import { createM5VenueAuthorityPersistenceUnitOfWork } from "@/infrastructure/postgres/m5-venue-authority-repository";
import { createM5VenueEvidenceUnitOfWork } from "@/infrastructure/postgres/m5-venue-evidence-uow";

const url = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_VENUE_AUTHORITY_INTEGRATION === "1" && Boolean(url);
function requireLoopback(value: string): void { const host = new URL(value).hostname; if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("M5_VENUE_INTEGRATION_REQUIRES_LOOPBACK"); }

const providerId = "synthetic-venue-provider";
const datasetId = "synthetic-venue-universe";
const datasetVersion = "synthetic-venue-universe/v1";
const asOf = "2026-03-03T00:00:00.000Z";
const recordedAt = "2026-03-03T00:05:00.000Z";
const contractAddress = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

function packageFixture() {
  const venues = [
    ["pool-a", "dex", "dex-alpha"],
    ["pool-b", "dex", "dex-alpha"],
    ["pair-c", "cex", "cex-beta"],
  ] as const;
  const records = venues.map(([externalId, namespace, venueId], index) => {
    const observedAt = "2026-03-02T00:00:00.000Z";
    const retrievedAt = `2026-03-02T00:0${index + 1}:00.000Z`;
    const normalizedEnvelope = { venueNamespace: namespace, venueId, venueType: namespace === "dex" ? "DEX" : "CEX", coverageKind: "PAGINATED_COMPLETE_UNIVERSE", coverageVersion: "venue-universe/v1", expectedPageCount: 1, expectedRecordCount: 3, pageOrdinal: 0, recordOrdinal: index, finalPage: true };
    const selectedAuditableFields = { externalId, venueNamespace: namespace, venueId, observedAt, retrievedAt };
    const payloadFingerprint = canonicalSha256({ normalizedEnvelope, selectedAuditableFields });
    return { providerExternalRecordId: externalId, providerRevision: "synthetic-venue/v1", payloadFingerprint, pageOrdinal: 0, itemOrdinal: index, retrievedAt, recordedAt, observedAt, normalizedEnvelope, selectedAuditableFields, metadata: { pageOrdinal: 0, cursorSafety: "NONE", responseHostPath: "https://synthetic.invalid/venues" } };
  });
  return { contractVersion: "m5-normalized-source-package/v1", idempotencyKey: "venue-authority-runtime-v1", providerId, datasetId, datasetVersion, providerSourceNamespace: "synthetic:venues", adapterContractVersion: "synthetic-venue-adapter/v1", adapterVersion: "synthetic-venue-adapter/v1", parserContractVersion: "synthetic-venue-parser/v1", parserVersion: "synthetic-venue-parser/v1", envelopeSchemaVersion: "synthetic-venue-envelope/v1", attemptNumber: 1, requestedAt: "2026-03-02T00:00:00.000Z", startedAt: "2026-03-02T00:00:01.000Z", recordedAt, requestScope: { contractAddress }, provenance: { system: "synthetic-fixture" }, executionInput: { fixture: "venue-universe" }, records };
}

describe.skipIf(!enabled)("M5 venue authority PostgreSQL integration", () => {
  it("persists exact venue set and atomically binds evidence", async () => {
    requireLoopback(url!);
    const sql = postgres(url!, { max: 1, prepare: true });
    try {
      await sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values (${providerId},${providerId},'SYNTHETIC_FIXTURE','local-test','provenance/v1','METADATA_ONLY') on conflict do nothing`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values (${datasetId},${providerId},${datasetVersion},'synthetic venue fixture','METADATA_ONLY') on conflict do nothing`;
      const plan = buildManualIngestionToLineagePlan(packageFixture());
      const ingested = await executeManualIngestionToLineage(plan.package, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) });
      expect(ingested.status).toBe("PERSISTED"); if (ingested.status !== "PERSISTED") return;
      const first = plan.records[0]!;
      const assertion = await createProviderAssetIdentityAssertionAuthority({ unitOfWork: createProviderAssetIdentityAssertionUnitOfWork(sql), projection: { projectionVersion: "m5-provider-asset-identity-projection/v1", sourceArtifactId: first.artifact.sourceArtifactId, sourceEnvelopeId: first.envelope.sourceEnvelopeId, parserVersion: plan.package.parserVersion, envelopeSchemaVersion: plan.package.envelopeSchemaVersion, identity: { type: "EVM_CONTRACT_ADDRESS", namespace: "eip155:1", value: contractAddress }, diagnostics: [] }, recordedAt });
      const mapping = await createAssetMappingRevisionFromSourceLineage({ unitOfWork: createAssetMappingSourceLineageUnitOfWork(sql), value: { sourceLineageId: ingested.sourceLineageId, providerAssetIdentityAssertionId: assertion.providerAssetIdentityAssertionId, canonicalAssetId: "canonical-venue", canonicalIdentifier: "asset:venue", assetClass: "CRYPTO", mappingRevisionVersion: "mapping/v1", validFrom: "2025-01-01T00:00:00.000Z", recordedAt } });
      const authority = await persistM5VenueAuthority({ providerId, datasetId, datasetVersion, sourceLineageId: ingested.sourceLineageId, asOf, universeNamespace: "synthetic:venues", universeId: "universe-1", recordedAt, unitOfWork: createM5VenueAuthorityPersistenceUnitOfWork(sql) });
      expect(authority, JSON.stringify(authority)).toMatchObject({ status: "PERSISTED" }); if (authority.status !== "PERSISTED") return;
      expect(authority.authority.members).toHaveLength(2);
      expect(authority.authority.members.map(member => member.venueId).sort()).toEqual(["cex-beta", "dex-alpha"]);
      const evidence = await persistM5VenueEvidence({ unitOfWork: createM5VenueEvidenceUnitOfWork(sql), mappingRevisionId: mapping.mappingRevisionId, authorityId: authority.authority.authorityId, candidateId: "candidate-venue" });
      expect(evidence, JSON.stringify(evidence)).toMatchObject({ status: "PERSISTED" }); if (evidence.status !== "PERSISTED") return;
      expect(evidence.evidence).toHaveLength(2);
      expect(evidence.evidence.map(row => row.venueMemberId).sort()).toEqual(authority.authority.members.map(member => member.memberId).sort());
      const counts = async () => (await sql`select (select count(*) from public.intelligence_m5_venue_authorities)::int authorities,(select count(*) from public.intelligence_m5_venue_authority_members)::int members,(select count(*) from public.eligibility_venue_evidence)::int evidence`)[0];
      expect(await counts()).toEqual({ authorities: 1, members: 2, evidence: 2 });
      const replay = await persistM5VenueEvidence({ unitOfWork: createM5VenueEvidenceUnitOfWork(sql), mappingRevisionId: mapping.mappingRevisionId, authorityId: authority.authority.authorityId, candidateId: "candidate-venue" });
      expect(replay.status).toBe("PERSISTED"); expect(await counts()).toEqual({ authorities: 1, members: 2, evidence: 2 });
      const rollbackUow = createM5VenueEvidenceUnitOfWork(sql);
      await expect(rollbackUow.withTransaction(async repositories => { await repositories.evidence.save(evidence.evidence[0]!); throw new Error("M5_TEST_VENUE_ROLLBACK_SENTINEL"); })).rejects.toThrow("M5_TEST_VENUE_ROLLBACK_SENTINEL");
      expect(await counts()).toEqual({ authorities: 1, members: 2, evidence: 2 });
    } finally { await sql.end({ timeout: 5 }); }
  });
});
