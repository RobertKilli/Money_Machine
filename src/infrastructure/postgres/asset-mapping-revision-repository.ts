import "server-only";
import postgres, { type Parameter, type Sql, type TransactionSql } from "postgres";
import { assertAssetMappingRevision, createAssetMappingRevision, type AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { AssetMappingRevisionLookup, AssetMappingRevisionRepository, MappingSourceLineageReader, MappingProviderAssetIdentityReader } from "@/application/intelligence/asset-mapping-revision-repository";
import type { AssetMappingSourceLineageUnitOfWork } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createSourceLineageRepository } from "@/infrastructure/postgres/source-lineage-repository";
import { createProviderAssetIdentityReadRepository } from "@/infrastructure/postgres/provider-asset-identity-repository";
import { assertProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";

type DbClient = Sql | TransactionSql;
type RawRow = Record<string, unknown>;

const connection = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_UNCONFIGURED");
  return postgres(url, { max: 1, prepare: true, ssl: "require" });
};
const text = (value: unknown, code: string): string => { if (typeof value !== "string" || !value.trim()) throw new Error(code); return value.trim(); };
const timestamp = (value: unknown, code: string): string => { const result = value instanceof Date ? value.toISOString() : text(value, code); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error(code); return result; };
const strings = (value: unknown): readonly string[] => { if (!Array.isArray(value)) throw new Error("M5_MAPPING_ROW_SOURCE_RECORDS_INVALID"); return value.map(item => text(item, "M5_MAPPING_ROW_SOURCE_RECORDS_INVALID")); };
const jsonParameter = (client: DbClient, value: unknown): Parameter => { const candidate = client as unknown as { readonly json?: (input: unknown) => unknown }; return (typeof candidate.json === "function" ? candidate.json(value) : JSON.stringify(value)) as Parameter; };

export function mapAssetMappingRevisionRow(row: RawRow): AssetMappingRevision {
  return createAssetMappingRevision({
    mappingRevisionId: text(row.mapping_revision_id, "M5_MAPPING_ROW_ID_INVALID"),
    mappingRevisionVersion: text(row.mapping_revision_version, "M5_MAPPING_ROW_VERSION_INVALID"),
    providerId: text(row.provider_id, "M5_MAPPING_ROW_PROVIDER_INVALID"),
    datasetId: text(row.dataset_id, "M5_MAPPING_ROW_DATASET_INVALID"),
    datasetVersion: text(row.dataset_version, "M5_MAPPING_ROW_DATASET_VERSION_INVALID"),
    sourceLineageId: text(row.source_lineage_id, "M5_MAPPING_ROW_SOURCE_LINEAGE_INVALID"),
    providerAssetIdentityAssertionId: text(row.provider_asset_identity_assertion_id, "M5_MAPPING_ROW_PROVIDER_ASSET_IDENTITY_ASSERTION_INVALID"),
    providerAssetNamespace: text(row.provider_asset_namespace, "M5_MAPPING_ROW_NAMESPACE_INVALID"),
    providerAssetId: text(row.provider_asset_id, "M5_MAPPING_ROW_PROVIDER_ASSET_INVALID"),
    canonicalAssetId: text(row.canonical_asset_id, "M5_MAPPING_ROW_CANONICAL_ASSET_INVALID"),
    canonicalIdentifier: text(row.canonical_identifier, "M5_MAPPING_ROW_CANONICAL_IDENTIFIER_INVALID"),
    assetClass: text(row.asset_class, "M5_MAPPING_ROW_ASSET_CLASS_INVALID"),
    validFrom: timestamp(row.valid_from, "M5_MAPPING_ROW_VALID_FROM_INVALID"),
    validTo: row.valid_to == null ? undefined : timestamp(row.valid_to, "M5_MAPPING_ROW_VALID_TO_INVALID"),
    observedAt: timestamp(row.observed_at, "M5_MAPPING_ROW_OBSERVED_INVALID"),
    availableAt: timestamp(row.available_at, "M5_MAPPING_ROW_AVAILABLE_INVALID"),
    sourceRecordIds: strings(row.source_record_ids),
    payloadFingerprint: text(row.payload_fingerprint, "M5_MAPPING_ROW_PAYLOAD_INVALID"),
    fingerprint: text(row.fingerprint, "M5_MAPPING_ROW_FINGERPRINT_INVALID"),
    recordedAt: timestamp(row.recorded_at, "M5_MAPPING_ROW_RECORDED_INVALID"),
  });
}

const overlap = (client: DbClient, mapping: AssetMappingRevision) => {
  const validTo = mapping.validTo ?? null;
  return client`
  select mapping_revision_id from public.intelligence_asset_mapping_revisions
  where provider_id=${mapping.providerId} and dataset_id=${mapping.datasetId} and dataset_version=${mapping.datasetVersion}
    and provider_asset_namespace=${mapping.providerAssetNamespace} and provider_asset_id=${mapping.providerAssetId}
    and mapping_revision_id<>${mapping.mappingRevisionId}
    and valid_from < coalesce(${validTo}, 'infinity'::timestamptz)
    and coalesce(valid_to, 'infinity'::timestamptz) > ${mapping.validFrom}
  order by mapping_revision_id
`;
};

async function validateAssertionBinding(mapping: AssetMappingRevision, assertionReader?: MappingProviderAssetIdentityReader): Promise<void> {
  if (!assertionReader) return;
  const assertion = await assertionReader.readById(mapping.providerAssetIdentityAssertionId);
  if (!assertion) throw new Error("M5_MAPPING_PROVIDER_ASSET_IDENTITY_ASSERTION_NOT_FOUND");
  assertProviderAssetIdentityAssertion(assertion);
  if (assertion.providerId !== mapping.providerId || assertion.datasetId !== mapping.datasetId || assertion.datasetVersion !== mapping.datasetVersion || assertion.providerSourceNamespace !== mapping.providerAssetNamespace || assertion.providerAssetId !== mapping.providerAssetId) throw new Error("M5_MAPPING_PROVIDER_ASSET_IDENTITY_SCOPE_MISMATCH");
}
async function save(client: DbClient, mapping: AssetMappingRevision, lineageReader?: MappingSourceLineageReader, assertionReader?: MappingProviderAssetIdentityReader): Promise<AssetMappingRevision> {
  assertAssetMappingRevision(mapping);
  await validateAssertionBinding(mapping, assertionReader);
  if (lineageReader) {
    const lineage = await lineageReader.readById(mapping.sourceLineageId);
    if (!lineage) throw new Error("M5_MAPPING_SOURCE_LINEAGE_NOT_FOUND");
    if (lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion) throw new Error("M5_MAPPING_SOURCE_LINEAGE_SCOPE_MISMATCH");
    if (mapping.payloadFingerprint !== lineage.fingerprint) throw new Error("M5_MAPPING_PAYLOAD_FINGERPRINT_MISMATCH");
    if (JSON.stringify(mapping.sourceRecordIds) !== JSON.stringify(lineage.sourceArtifactIds)) throw new Error("M5_MAPPING_SOURCE_RECORD_PROJECTION_MISMATCH");
    if (mapping.observedAt !== lineage.observedAt || mapping.availableAt !== lineage.effectiveAvailableAt) throw new Error("M5_MAPPING_TEMPORAL_MISMATCH");
  }
  const conflicts = await overlap(client, mapping);
  if (conflicts.length) throw new Error("M5_MAPPING_INTERVAL_CONFLICT");
  const inserted = await client`
    insert into public.intelligence_asset_mapping_revisions
      (mapping_revision_id,mapping_revision_version,provider_id,dataset_id,dataset_version,source_lineage_id,provider_asset_identity_assertion_id,provider_asset_namespace,provider_asset_id,canonical_asset_id,canonical_identifier,asset_class,valid_from,valid_to,observed_at,available_at,source_record_ids,payload_fingerprint,fingerprint,recorded_at)
    values
      (${mapping.mappingRevisionId},${mapping.mappingRevisionVersion},${mapping.providerId},${mapping.datasetId},${mapping.datasetVersion},${mapping.sourceLineageId},${mapping.providerAssetIdentityAssertionId},${mapping.providerAssetNamespace},${mapping.providerAssetId},${mapping.canonicalAssetId},${mapping.canonicalIdentifier},${mapping.assetClass},${mapping.validFrom},${mapping.validTo ?? null},${mapping.observedAt},${mapping.availableAt},${jsonParameter(client, mapping.sourceRecordIds)},${mapping.payloadFingerprint},${mapping.fingerprint},${mapping.recordedAt})
    on conflict (mapping_revision_id) do nothing returning mapping_revision_id
  `;
  if (inserted.length) {
    const reread = await client`select * from public.intelligence_asset_mapping_revisions where mapping_revision_id=${mapping.mappingRevisionId}`;
    if (reread.length !== 1) throw new Error("M5_MAPPING_REPOSITORY_CONTRACT_VIOLATION");
    const stored = mapAssetMappingRevisionRow(reread[0] as RawRow);
    if (stored.fingerprint !== mapping.fingerprint) throw new Error("M5_MAPPING_REVISION_CONFLICT");
    return stored;
  }
  const existing = await client`select * from public.intelligence_asset_mapping_revisions where mapping_revision_id=${mapping.mappingRevisionId}`;
  if (existing.length !== 1) throw new Error("M5_MAPPING_REVISION_NOT_FOUND_AFTER_CONFLICT");
  if (text((existing[0] as RawRow).fingerprint, "M5_MAPPING_ROW_FINGERPRINT_INVALID") !== mapping.fingerprint) throw new Error("M5_MAPPING_REVISION_CONFLICT");
  const stored = mapAssetMappingRevisionRow(existing[0] as RawRow);
  if (stored.fingerprint !== mapping.fingerprint) throw new Error("M5_MAPPING_REVISION_CONFLICT");
  return stored;
}

async function validateLineageBinding(mapping: AssetMappingRevision, lineageReader?: MappingSourceLineageReader, assertionReader?: MappingProviderAssetIdentityReader): Promise<AssetMappingRevision> {
  await validateAssertionBinding(mapping, assertionReader);
  if (!lineageReader) return mapping;
  const lineage = await lineageReader.readById(mapping.sourceLineageId);
  if (!lineage) throw new Error("M5_MAPPING_SOURCE_LINEAGE_NOT_FOUND");
  if (lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion) throw new Error("M5_MAPPING_SOURCE_LINEAGE_SCOPE_MISMATCH");
  if (mapping.payloadFingerprint !== lineage.fingerprint) throw new Error("M5_MAPPING_PAYLOAD_FINGERPRINT_MISMATCH");
  if (JSON.stringify(mapping.sourceRecordIds) !== JSON.stringify(lineage.sourceArtifactIds)) throw new Error("M5_MAPPING_SOURCE_RECORD_PROJECTION_MISMATCH");
  if (mapping.observedAt !== lineage.observedAt || mapping.availableAt !== lineage.effectiveAvailableAt) throw new Error("M5_MAPPING_TEMPORAL_MISMATCH");
  return mapping;
}

async function readCandidatesAt(client: DbClient, lookup: AssetMappingRevisionLookup, lineageReader?: MappingSourceLineageReader, assertionReader?: MappingProviderAssetIdentityReader): Promise<readonly AssetMappingRevision[]> {
  const rows = await client`
    select * from public.intelligence_asset_mapping_revisions
    where provider_id=${lookup.providerId} and dataset_id=${lookup.datasetId} and dataset_version=${lookup.datasetVersion}
      and provider_asset_namespace=${lookup.providerAssetNamespace} and provider_asset_id=${lookup.providerAssetId}
      and valid_from <= ${lookup.asOf} and (valid_to is null or ${lookup.asOf} < valid_to)
    order by valid_from asc, valid_to asc nulls last, mapping_revision_id asc
  `;
  const mapped = rows.map(row => mapAssetMappingRevisionRow(row as RawRow));
  return Promise.all(mapped.map(mapping => validateLineageBinding(mapping, lineageReader, assertionReader)));
}

async function readById(client: DbClient, mappingRevisionId: string, lineageReader?: MappingSourceLineageReader, assertionReader?: MappingProviderAssetIdentityReader): Promise<AssetMappingRevision | undefined> {
  const rows = await client`select * from public.intelligence_asset_mapping_revisions where mapping_revision_id=${mappingRevisionId}`;
  if (rows.length === 0) return undefined;
  if (rows.length !== 1) throw new Error("M5_MAPPING_ROW_AMBIGUOUS");
  return validateLineageBinding(mapAssetMappingRevisionRow(rows[0] as RawRow), lineageReader, assertionReader);
}

export function createAssetMappingRevisionRepository(client: DbClient, lineageReader?: MappingSourceLineageReader, assertionReader?: MappingProviderAssetIdentityReader): AssetMappingRevisionRepository {
  return { save: mapping => save(client, mapping, lineageReader, assertionReader), readCandidatesAt: lookup => readCandidatesAt(client, lookup, lineageReader, assertionReader), readById: mappingRevisionId => readById(client, mappingRevisionId, lineageReader, assertionReader) };
}

/** Shared transaction boundary for mapping creation and lineage validation. */
export function createAssetMappingSourceLineageUnitOfWork(client: Sql): AssetMappingSourceLineageUnitOfWork {
  return {
    withTransaction: <T>(work: (repositories: { readonly sourceLineageRepository: ReturnType<typeof createSourceLineageRepository>; readonly providerAssetIdentityAssertionRepository: ReturnType<typeof createProviderAssetIdentityReadRepository>; readonly mappingRepository: AssetMappingRevisionRepository }) => Promise<T>) => client.begin(async transaction => {
      const sourceLineageRepository = createSourceLineageRepository(transaction);
      const providerAssetIdentityAssertionRepository = createProviderAssetIdentityReadRepository(transaction);
      const mappingRepository = createAssetMappingRevisionRepository(transaction, sourceLineageRepository, providerAssetIdentityAssertionRepository);
      return work({ sourceLineageRepository, providerAssetIdentityAssertionRepository, mappingRepository });
    }) as unknown as Promise<T>,
  };
}

export async function saveAssetMappingRevision(mapping: AssetMappingRevision): Promise<void> {
  const sql = connection();
  try { await createAssetMappingRevisionRepository(sql).save(mapping); } finally { await sql.end({ timeout: 5 }); }
}
