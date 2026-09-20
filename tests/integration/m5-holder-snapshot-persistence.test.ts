import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
import { buildM5HolderSnapshotRequestPlan, assembleM5HolderPageSet, holderPagePayloadFingerprint, projectM5HolderPageSetToSnapshot } from "@/application/intelligence/m5-holder-snapshot-adapter";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createM5HolderSnapshotPersistenceUnitOfWork } from "@/infrastructure/postgres/m5-holder-snapshot-repository";
import { persistM5HolderSnapshotFromSourceLineage } from "@/application/intelligence/m5-holder-snapshot-persistence";

const url = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_HOLDER_PERSISTENCE_INTEGRATION === "1" && process.env.MONEY_MACHINE_HOLDER_PERSISTENCE_SCHEMA_READY === "1" && Boolean(url);
function assertLocal(value: string): void { const host = new URL(value).hostname; if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error("M5_HOLDER_INTEGRATION_REQUIRES_LOOPBACK"); }

describe.skipIf(!enabled)("M5 holder snapshot persistence PostgreSQL integration", () => {
  it("ingests, seals, persists and replays a synthetic holder snapshot", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 1, prepare: true });
    const providerId = "MM_LOCAL_HOLDER_PROVIDER";
    const datasetId = "mm-local-holder-dataset";
    const datasetVersion = "holder/v1";
    try {
      await sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values (${providerId},${providerId},'SYNTHETIC_FIXTURE','local-test','provenance/v1','METADATA_ONLY') on conflict do nothing`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values (${datasetId},${providerId},${datasetVersion},'synthetic holder fixture','METADATA_ONLY') on conflict do nothing`;
      const request = buildM5HolderSnapshotRequestPlan({ providerId, datasetId, datasetVersion, providerSourceNamespace: "synthetic:holder", contractAddress: `0x${"1".repeat(40)}`, pageSize: 2, asOf: "2026-02-01T00:20:00.000Z" });
      const page = (ordinal: number, final: boolean) => {
        const maxUint256 = (1n << 256n) - 1n;
        const material = { providerId, datasetId, datasetVersion, providerSourceNamespace: request.providerSourceNamespace, chainId: "eip155:1" as const, contractAddress: request.contractAddress, snapshotBlockNumber: 100n, snapshotBlockHash: `0x${"a".repeat(64)}`, snapshotBlockTimestamp: "2026-02-01T00:00:00.000Z", tokenDecimals: 18, totalSupplyAtoms: maxUint256, declaredHolderCount: 1, declaredPageCount: 1, pageOrdinal: ordinal, isFinal: final, nextPageState: { kind: "NONE" as const }, holders: [{ itemOrdinal: 0, address: `0x${"2".repeat(40)}`, balanceAtoms: maxUint256 }], receipt: { receivedAt: "2026-02-01T00:05:00.000Z" }, sourceRecordId: "holder-page-0", finality: { referenceBlockNumber: 112n, referenceBlockHash: `0x${"b".repeat(64)}`, observedAt: "2026-02-01T00:07:00.000Z", receivedAt: "2026-02-01T00:08:00.000Z" } };
        return { fixtureVersion: "m5-holder-page-fixture/v1", ...material, snapshotBlockNumber: "100", totalSupplyAtoms: material.totalSupplyAtoms.toString(), holders: material.holders.map(holder => ({ ...holder, balanceAtoms: holder.balanceAtoms.toString() })), finality: { ...material.finality, referenceBlockNumber: "112" }, payloadFingerprint: holderPagePayloadFingerprint(material) };
      };
      const pages = assembleM5HolderPageSet({ request, pages: [page(0, true)] });
      expect(pages.status).toBe("COMPLETE");
      if (pages.status !== "COMPLETE") return;
      const normalized = (await import("@/application/intelligence/m5-holder-snapshot-adapter")).projectM5HolderPageSetToNormalizedPackage({ pageSet: pages, idempotencyKey: "holder-persistence-v1", requestedAt: "2026-02-01T00:01:00.000Z", startedAt: "2026-02-01T00:02:00.000Z", recordedAt: "2026-02-01T00:09:00.000Z" });
      const ingestion = await executeManualIngestionToLineage(normalized, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) });
      expect(ingestion.status).toBe("PERSISTED");
      if (ingestion.status !== "PERSISTED") return;
      const projected = projectM5HolderPageSetToSnapshot({ pageSet: pages, asOf: request.asOf, recordedAt: "2026-02-01T00:09:00.000Z" });
      expect(projected.status).toBe("COMPLETE");
      if (projected.status !== "COMPLETE") return;
      const uow = createM5HolderSnapshotPersistenceUnitOfWork(sql);
      const first = await persistM5HolderSnapshotFromSourceLineage({ snapshot: projected.snapshot, sourceLineageId: ingestion.sourceLineageId, asOf: request.asOf, recordedAt: "2026-02-01T00:09:00.000Z", unitOfWork: uow });
      expect(first.status).toBe("PERSISTED");
      const counts = async () => (await sql`select (select count(*) from public.intelligence_m5_holder_snapshots)::int as snapshots,(select count(*) from public.intelligence_m5_holder_snapshot_pages)::int as pages,(select count(*) from public.intelligence_m5_holder_snapshot_holders)::int as holders,(select count(*) from public.intelligence_m5_holder_concentration_derivations)::int as derivations`)[0];
      const afterFirst = await counts();
      expect(afterFirst).toEqual({ snapshots: 1, pages: 1, holders: 1, derivations: 2 });
      const replay = await persistM5HolderSnapshotFromSourceLineage({ snapshot: projected.snapshot, sourceLineageId: ingestion.sourceLineageId, asOf: request.asOf, recordedAt: "2026-02-01T00:09:00.000Z", unitOfWork: uow });
      expect(replay.status).toBe("PERSISTED");
      expect(await counts()).toEqual(afterFirst);
    } finally { await sql.end({ timeout: 5 }); }
  });
});
