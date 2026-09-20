import type { Sql, TransactionSql } from "postgres";
import { createM5HolderSnapshot, deriveM5HolderConcentration, type M5HolderPage, type M5HolderSnapshot } from "@/domain/intelligence/m5-holder-concentration";
import type { M5HolderSnapshotAuthorityAggregate, M5HolderSnapshotAuthorityUnitOfWork } from "@/application/intelligence/m5-holder-snapshot-persistence";
import { createTransactionSourceLineageRepository } from "./source-lineage-repository";

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value as Row;
const text = (value: unknown, code: string): string => { if (typeof value !== "string" || value.length === 0) throw new Error(code); return value; };
const decimal = (value: unknown, code: string): bigint => { const source = typeof value === "string" || typeof value === "bigint" ? value.toString() : String(value); if (!/^(0|[1-9][0-9]*)$/.test(source)) throw new Error(code); return BigInt(source); };
const int = (value: unknown, code: string): number => { const n = typeof value === "number" ? value : Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error(code); return n; };
const json = (value: unknown, code: string): unknown => { if (!value || typeof value !== "object") throw new Error(code); return value; };
const timestamp = (value: unknown, code: string): string => { const result = value instanceof Date ? value.toISOString() : text(value, code); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result)) throw new Error(code); return result; };

function mapPage(r: Row): M5HolderPage {
  return Object.freeze({ pageOrdinal: int(r.page_ordinal, "M5_HOLDER_REPOSITORY_PAGE_INVALID"), itemCount: int(r.item_count, "M5_HOLDER_REPOSITORY_PAGE_INVALID"), isFinal: r.is_final === true, blockNumber: decimal(r.block_number, "M5_HOLDER_REPOSITORY_PAGE_INVALID"), blockHash: text(r.block_hash, "M5_HOLDER_REPOSITORY_PAGE_INVALID"), tokenDecimals: int(r.token_decimals, "M5_HOLDER_REPOSITORY_PAGE_INVALID"), sourceRecordIds: Object.freeze([text(r.source_artifact_id, "M5_HOLDER_REPOSITORY_PAGE_INVALID")]), payloadFingerprint: text(r.payload_fingerprint, "M5_HOLDER_REPOSITORY_PAGE_INVALID") });
}

function mapSnapshot(r: Row, pages: readonly M5HolderPage[], holders: readonly Row[]): M5HolderSnapshot {
  const materialIds = json(r.material_source_record_ids, "M5_HOLDER_REPOSITORY_PARENT_INVALID") as string[];
  const payloads = json(r.payload_fingerprints, "M5_HOLDER_REPOSITORY_PARENT_INVALID") as string[];
  const input = {
    providerId: text(r.provider_id, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), datasetId: text(r.dataset_id, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), datasetVersion: text(r.dataset_version, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), sourceLineageId: text(r.source_lineage_id, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), sourceLineageBinding: "BOUND" as const, chainId: text(r.chain_id, "M5_HOLDER_REPOSITORY_PARENT_INVALID") as "eip155:1", contractAddress: text(r.contract_address, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), blockNumber: decimal(r.block_number, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), blockHash: text(r.block_hash, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), blockTimestamp: timestamp(r.block_timestamp, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), finalityStatus: text(r.finality_status, "M5_HOLDER_REPOSITORY_PARENT_INVALID") as "CONFIRMED" | "FINALIZED", finalityDepth: int(r.finality_depth, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), tokenDecimals: int(r.token_decimals, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), supplyBasis: "TOTAL_SUPPLY" as const, addressPolicy: "INCLUDE_ALL" as const, denominatorAtoms: decimal(r.denominator_atoms, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), declaredHolderCount: int(r.declared_holder_count, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), fullPaginationProof: { pageCount: int(r.declared_page_count, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), finalPageOrdinal: int(r.final_page_ordinal, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), pages }, holders: holders.map((h, ordinal) => ({ address: text(h.holder_address, "M5_HOLDER_REPOSITORY_HOLDER_INVALID"), balanceAtoms: decimal(h.balance_atoms, "M5_HOLDER_REPOSITORY_HOLDER_INVALID"), inclusionState: "INCLUDED" as const, sourceRecordId: text(h.source_artifact_id, "M5_HOLDER_REPOSITORY_HOLDER_INVALID"), sourcePageOrdinal: int(h.source_page_ordinal, "M5_HOLDER_REPOSITORY_HOLDER_INVALID"), sourceItemOrdinal: int(h.source_item_ordinal, "M5_HOLDER_REPOSITORY_HOLDER_INVALID"), ordinal })), materialSourceRecordIds: materialIds, payloadFingerprints: payloads, observedAt: timestamp(r.observed_at, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), availableAt: timestamp(r.available_at, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), recordedAt: timestamp(r.recorded_at, "M5_HOLDER_REPOSITORY_PARENT_INVALID")
  };
  return createM5HolderSnapshot({ ...input, snapshotId: text(r.snapshot_id, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), fingerprint: text(r.fingerprint, "M5_HOLDER_REPOSITORY_PARENT_INVALID") });
}

export function createM5HolderSnapshotTransactionRepository(client: TransactionSql) {
  const readById = async (snapshotId: string): Promise<M5HolderSnapshotAuthorityAggregate | undefined> => {
    const parents = await client`select * from public.intelligence_m5_holder_snapshots where snapshot_id=${snapshotId} for update`;
    if (parents.length === 0) return undefined;
    if (parents.length !== 1) throw new Error("M5_HOLDER_REPOSITORY_PARENT_INVALID");
    const parent = row(parents[0]);
    const pageRows = await client`select * from public.intelligence_m5_holder_snapshot_pages where snapshot_id=${snapshotId} order by page_ordinal asc`;
    const holderRows = await client`select * from public.intelligence_m5_holder_snapshot_holders where snapshot_id=${snapshotId} order by holder_ordinal asc`;
    const derivationRows = await client`select * from public.intelligence_m5_holder_concentration_derivations where snapshot_id=${snapshotId} order by metric_kind asc`;
    if (pageRows.length !== int(parent.declared_page_count, "M5_HOLDER_REPOSITORY_PARENT_INVALID") || holderRows.length !== int(parent.declared_holder_count, "M5_HOLDER_REPOSITORY_PARENT_INVALID") || derivationRows.length !== 2) throw new Error("M5_HOLDER_REPOSITORY_SEALED_SET_INVALID");
    const snapshot = mapSnapshot(parent, pageRows.map(value => mapPage(row(value))), holderRows.map(value => row(value)));
    const concentration = deriveM5HolderConcentration(snapshot, timestamp(row(derivationRows[0]).as_of, "M5_HOLDER_REPOSITORY_DERIVATION_INVALID"));
    if (concentration.status !== "READY") throw new Error("M5_HOLDER_REPOSITORY_DERIVATION_INVALID");
    for (const d of derivationRows) {
      const key = text(row(d).metric_kind, "M5_HOLDER_REPOSITORY_DERIVATION_INVALID");
      const expected = key === "SINGLE_CONCENTRATION" ? concentration.single : key === "TOP10_CONCENTRATION" ? concentration.top10 : undefined;
      if (!expected || decimal(row(d).value_bps, "M5_HOLDER_REPOSITORY_DERIVATION_INVALID") !== expected.valueAtoms || text(row(d).fingerprint, "M5_HOLDER_REPOSITORY_DERIVATION_INVALID") !== expected.fingerprint) throw new Error("M5_HOLDER_REPOSITORY_DERIVATION_INVALID");
    }
    return Object.freeze({ snapshot, concentration, finalityProof: Object.freeze({ referenceBlockNumber: decimal(parent.finality_reference_block_number, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), referenceBlockHash: text(parent.finality_reference_block_hash, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), observedAt: timestamp(parent.finality_observed_at, "M5_HOLDER_REPOSITORY_PARENT_INVALID"), receivedAt: timestamp(parent.finality_received_at, "M5_HOLDER_REPOSITORY_PARENT_INVALID") }) });
  };
  const save = async (aggregate: M5HolderSnapshotAuthorityAggregate): Promise<M5HolderSnapshotAuthorityAggregate> => {
    const inserted = await client`insert into public.intelligence_m5_holder_snapshots (snapshot_id,contract_version,provider_id,dataset_id,dataset_version,source_lineage_id,source_lineage_binding,chain_id,contract_address,block_number,block_hash,block_timestamp,finality_status,finality_depth,finality_reference_block_number,finality_reference_block_hash,finality_observed_at,finality_received_at,token_decimals,supply_basis,address_policy,denominator_atoms,declared_holder_count,declared_page_count,final_page_ordinal,material_source_record_ids,payload_fingerprints,observed_at,available_at,fingerprint,recorded_at) values (${aggregate.snapshot.snapshotId},${aggregate.snapshot.contractVersion},${aggregate.snapshot.providerId},${aggregate.snapshot.datasetId},${aggregate.snapshot.datasetVersion},${aggregate.snapshot.sourceLineageId},${aggregate.snapshot.sourceLineageBinding},${aggregate.snapshot.chainId},${aggregate.snapshot.contractAddress},${aggregate.snapshot.blockNumber.toString()},${aggregate.snapshot.blockHash},${aggregate.snapshot.blockTimestamp},${aggregate.snapshot.finalityStatus},${aggregate.snapshot.finalityDepth},${aggregate.finalityProof.referenceBlockNumber.toString()},${aggregate.finalityProof.referenceBlockHash},${aggregate.finalityProof.observedAt},${aggregate.finalityProof.receivedAt},${aggregate.snapshot.tokenDecimals},${aggregate.snapshot.supplyBasis},${aggregate.snapshot.addressPolicy},${aggregate.snapshot.denominatorAtoms.toString()},${aggregate.snapshot.declaredHolderCount},${aggregate.snapshot.fullPaginationProof.pageCount},${aggregate.snapshot.fullPaginationProof.finalPageOrdinal},${client.json(aggregate.snapshot.materialSourceRecordIds)},${client.json(aggregate.snapshot.payloadFingerprints)},${aggregate.snapshot.observedAt},${aggregate.snapshot.availableAt},${aggregate.snapshot.fingerprint},${aggregate.snapshot.recordedAt}) on conflict (snapshot_id) do nothing returning snapshot_id`;
    if (inserted.length) {
      for (const page of aggregate.snapshot.fullPaginationProof.pages) await client`insert into public.intelligence_m5_holder_snapshot_pages (snapshot_id,page_ordinal,item_count,is_final,block_number,block_hash,token_decimals,source_artifact_id,provider_id,dataset_id,dataset_version,payload_fingerprint) values (${aggregate.snapshot.snapshotId},${page.pageOrdinal},${page.itemCount},${page.isFinal},${page.blockNumber.toString()},${page.blockHash},${page.tokenDecimals},${page.sourceRecordIds[0]},${aggregate.snapshot.providerId},${aggregate.snapshot.datasetId},${aggregate.snapshot.datasetVersion},${page.payloadFingerprint}) on conflict do nothing`;
      for (const holder of aggregate.snapshot.holders) await client`insert into public.intelligence_m5_holder_snapshot_holders (snapshot_id,holder_ordinal,source_page_ordinal,source_item_ordinal,source_artifact_id,holder_address,balance_atoms,inclusion_state) values (${aggregate.snapshot.snapshotId},${holder.ordinal},${holder.sourcePageOrdinal},${holder.sourceItemOrdinal},${holder.sourceRecordId},${holder.address},${holder.balanceAtoms.toString()},${holder.inclusionState}) on conflict do nothing`;
      for (const metric of [aggregate.concentration.single, aggregate.concentration.top10]) await client`insert into public.intelligence_m5_holder_concentration_derivations (snapshot_id,metric_kind,value_bps,unit,scale,policy_version,ordered_material_source_record_ids,observed_at,available_at,as_of,fingerprint,recorded_at) values (${aggregate.snapshot.snapshotId},${metric.metricKind},${metric.valueAtoms.toString()},${metric.unit},${metric.scale},${metric.policyVersion},${client.json(metric.orderedMaterialSourceRecordIds)},${aggregate.snapshot.observedAt},${aggregate.snapshot.availableAt},${metric.asOf},${metric.fingerprint},${aggregate.snapshot.recordedAt}) on conflict do nothing`;
    }
    const reread = await readById(aggregate.snapshot.snapshotId);
    if (!reread || reread.snapshot.fingerprint !== aggregate.snapshot.fingerprint || reread.finalityProof.referenceBlockNumber !== aggregate.finalityProof.referenceBlockNumber || reread.finalityProof.referenceBlockHash !== aggregate.finalityProof.referenceBlockHash || reread.finalityProof.receivedAt !== aggregate.finalityProof.receivedAt) throw new Error("M5_HOLDER_REPOSITORY_CONFLICT");
    return reread;
  };
  return Object.freeze({ save, readById });
}

export function createM5HolderSnapshotPersistenceUnitOfWork(sql: Sql): M5HolderSnapshotAuthorityUnitOfWork {
  return { withTransaction: work => sql.begin(async transaction => work(Object.freeze({ sourceLineage: createTransactionSourceLineageRepository(transaction), snapshots: createM5HolderSnapshotTransactionRepository(transaction) }))) as unknown as Promise<unknown> } as M5HolderSnapshotAuthorityUnitOfWork;
}
