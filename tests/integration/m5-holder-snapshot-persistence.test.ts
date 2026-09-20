import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
import { buildM5HolderSnapshotRequestPlan, assembleM5HolderPageSet, holderPagePayloadFingerprint, projectM5HolderPageSetToSnapshot } from "@/application/intelligence/m5-holder-snapshot-adapter";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createM5HolderSnapshotPersistenceUnitOfWork, createM5HolderSnapshotTransactionRepository } from "@/infrastructure/postgres/m5-holder-snapshot-repository";
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
      const maxUint256 = (1n << 256n) - 1n;
      const balances = [maxUint256 - 1000n, ...Array.from({ length: 10 }, () => 100n)];
      const page = (ordinal: number, final: boolean) => {
        const pageHolders = balances.slice(ordinal === 0 ? 0 : 6, ordinal === 0 ? 6 : 11).map((balanceAtoms, itemOrdinal) => ({ itemOrdinal, address: `0x${String(ordinal === 0 ? itemOrdinal + 2 : itemOrdinal + 2 + 6).padStart(40, "0")}`, balanceAtoms }));
        const maxUint256 = (1n << 256n) - 1n;
        const material = { providerId, datasetId, datasetVersion, providerSourceNamespace: request.providerSourceNamespace, chainId: "eip155:1" as const, contractAddress: request.contractAddress, snapshotBlockNumber: 100n, snapshotBlockHash: `0x${"a".repeat(64)}`, snapshotBlockTimestamp: "2026-02-01T00:00:00.000Z", tokenDecimals: 18, totalSupplyAtoms: maxUint256, declaredHolderCount: 11, declaredPageCount: 2, pageOrdinal: ordinal, isFinal: final, nextPageState: final ? { kind: "NONE" as const } : { kind: "MORE" as const, nextPageOrdinal: 1 }, holders: pageHolders, receipt: { receivedAt: ordinal === 0 ? "2026-02-01T00:05:00.000Z" : "2026-02-01T00:06:00.000Z" }, sourceRecordId: `holder-page-${ordinal}`, finality: { referenceBlockNumber: 112n, referenceBlockHash: `0x${"b".repeat(64)}`, observedAt: "2026-02-01T00:07:00.000Z", receivedAt: "2026-02-01T00:08:00.000Z" } };
        return { fixtureVersion: "m5-holder-page-fixture/v1", ...material, snapshotBlockNumber: "100", totalSupplyAtoms: material.totalSupplyAtoms.toString(), holders: material.holders.map(holder => ({ ...holder, balanceAtoms: holder.balanceAtoms.toString() })), finality: { ...material.finality, referenceBlockNumber: "112" }, payloadFingerprint: holderPagePayloadFingerprint(material) };
      };
      const pages = assembleM5HolderPageSet({ request, pages: [page(0, false), page(1, true)] });
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
      expect(afterFirst).toEqual({ snapshots: 1, pages: 2, holders: 11, derivations: 2 });
      const derivations = await sql`select metric_kind,value_bps from public.intelligence_m5_holder_concentration_derivations where snapshot_id=${first.status === "PERSISTED" ? first.aggregate.snapshot.snapshotId : ""} order by metric_kind`;
      const ceilBps = (numerator: bigint) => (numerator * 10_000n + maxUint256 - 1n) / maxUint256;
      expect(derivations.map(row => [String(row.metric_kind), BigInt(String(row.value_bps))])).toEqual([["SINGLE_CONCENTRATION", ceilBps(maxUint256 - 1000n)], ["TOP10_CONCENTRATION", ceilBps(maxUint256 - 100n)]]);
      const replay = await persistM5HolderSnapshotFromSourceLineage({ snapshot: projected.snapshot, sourceLineageId: ingestion.sourceLineageId, asOf: request.asOf, recordedAt: "2026-02-01T00:09:00.000Z", unitOfWork: uow });
      expect(replay.status).toBe("PERSISTED");
      expect(await counts()).toEqual(afterFirst);
      const missingLineage = await persistM5HolderSnapshotFromSourceLineage({ snapshot: projected.snapshot, sourceLineageId: "missing-lineage", asOf: request.asOf, recordedAt: "2026-02-01T00:09:00.000Z", unitOfWork: uow });
      expect(missingLineage.status).toBe("INCOMPLETE");
      expect(await counts()).toEqual(afterFirst);
      if (first.status !== "PERSISTED") return;
      await expect(sql.begin(async transaction => {
        const repository = createM5HolderSnapshotTransactionRepository(transaction);
        await repository.save(first.aggregate);
        throw new Error("M5_TEST_ROLLBACK_SENTINEL");
      })).rejects.toThrow("M5_TEST_ROLLBACK_SENTINEL");
      expect(await counts()).toEqual(afterFirst);
    } finally { await sql.end({ timeout: 5 }); }
  });
});
