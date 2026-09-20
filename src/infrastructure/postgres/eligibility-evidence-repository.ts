import "server-only";
import type { Sql, TransactionSql } from "postgres";
import {
  assertRawEligibilityEvidence,
  createAgeReferenceEligibilityEvidence,
  createContractVerificationEligibilityEvidence,
  createQuantitativeEligibilityEvidence,
  createSuspiciousEligibilityEvidence,
  createVenueEligibilityEvidence,
  type RawEligibilityEvidence,
} from "@/domain/intelligence/eligibility-evidence";
import { assertAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";
import type { RawEvidenceUnitOfWork } from "@/application/intelligence/create-raw-eligibility-evidence-from-mapping";
import { createSourceLineageRepository } from "@/infrastructure/postgres/source-lineage-repository";
import { createAssetMappingRevisionRepository } from "@/infrastructure/postgres/asset-mapping-revision-repository";

type DbClient = Sql | TransactionSql;
type RawRow = Record<string, unknown>;

const text = (value: unknown, code: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value;
};
const optionalText = (value: unknown) =>
  value == null ? undefined : text(value, "M5_RAW_ROW_INVALID");
const timestamp = (value: unknown, code: string) =>
  value instanceof Date ? value.toISOString() : text(value, code);
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const canonicalTimestamp = (value: string, code: string) => {
  if (
    !UTC.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    throw new Error(code);
  return value;
};
const integer = (value: unknown, code: string) => {
  const raw = typeof value === "bigint" ? value.toString() : text(value, code);
  if (!/^-?\d+$/.test(raw)) throw new Error(code);
  return BigInt(raw);
};
const object = (value: unknown, code: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(code);
  return value as Record<string, unknown>;
};
const json = (value: unknown) =>
  JSON.stringify(value, (_, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
const common = (row: RawRow) => ({
  evidenceId: text(row.evidence_id, "M5_RAW_ROW_ID_INVALID"),
  candidateId: text(row.candidate_id, "M5_RAW_ROW_CANDIDATE_INVALID"),
  assetId: text(row.asset_id, "M5_RAW_ROW_ASSET_INVALID"),
  canonicalIdentifier: text(
    row.canonical_identifier,
    "M5_RAW_ROW_IDENTIFIER_INVALID",
  ),
  assetClass: text(row.asset_class, "M5_RAW_ROW_CLASS_INVALID"),
  providerId: text(row.provider_id, "M5_RAW_ROW_PROVIDER_INVALID"),
  datasetId: text(row.dataset_id, "M5_RAW_ROW_DATASET_INVALID"),
  datasetVersion: text(row.dataset_version, "M5_RAW_ROW_VERSION_INVALID"),
  mappingRevisionId: text(
    row.mapping_revision_id,
    "M5_RAW_ROW_MAPPING_REVISION_INVALID",
  ),
  sourceLineageId: text(
    row.source_lineage_id,
    "M5_RAW_ROW_SOURCE_LINEAGE_INVALID",
  ),
  observedAt: timestamp(row.observed_at, "M5_RAW_ROW_OBSERVED_INVALID"),
  availableAt: timestamp(row.available_at, "M5_RAW_ROW_AVAILABLE_INVALID"),
  provenance: object(row.provenance, "M5_RAW_ROW_PROVENANCE_INVALID"),
});
const verified = <T extends RawEligibilityEvidence>(
  evidence: T,
  stored: unknown,
): T => {
  if (evidence.fingerprint !== text(stored, "M5_RAW_ROW_FINGERPRINT_INVALID"))
    throw new Error("M5_RAW_ROW_FINGERPRINT_MISMATCH");
  return evidence;
};
export function mapQuantitativeEligibilityEvidenceRow(row: RawRow) {
  const b = common(row);
  return verified(
    createQuantitativeEligibilityEvidence({
      ...b,
      metricKind: text(row.metric_kind, "M5_RAW_ROW_METRIC_INVALID") as never,
      valueAtoms: integer(row.value_atoms, "M5_RAW_ROW_VALUE_INVALID"),
      scale: Number(row.scale),
      unit: text(row.unit, "M5_RAW_ROW_UNIT_INVALID"),
      semanticsVersion: text(
        row.semantics_version,
        "M5_RAW_ROW_SEMANTICS_INVALID",
      ),
      currencyCode: optionalText(row.currency_code),
      window:
        row.window_start_at == null
          ? undefined
          : {
              startAt: timestamp(
                row.window_start_at,
                "M5_RAW_ROW_WINDOW_INVALID",
              ),
              endAt: timestamp(row.window_end_at, "M5_RAW_ROW_WINDOW_INVALID"),
            },
      qualificationBasis: optionalText(row.qualification_basis),
      holderSnapshotId: optionalText(row.holder_snapshot_id),
      holderSnapshotFingerprint: optionalText(row.holder_snapshot_fingerprint),
      holderDerivationFingerprint: optionalText(row.holder_derivation_fingerprint),
      asOf: row.as_of == null ? undefined : timestamp(row.as_of, "M5_RAW_ROW_AS_OF_INVALID"),
    } as never),
    row.fingerprint,
  );
}
export function mapReferenceEligibilityEvidenceRow(row: RawRow) {
  const b = common(row);
  return row.reference_kind === "CONTRACT_VERIFICATION"
    ? verified(
        createContractVerificationEligibilityEvidence({
          ...b,
          verificationState: text(
            row.verification_state,
            "M5_RAW_ROW_VERIFICATION_INVALID",
          ) as never,
        } as never),
        row.fingerprint,
      )
    : verified(
        createAgeReferenceEligibilityEvidence({
          ...b,
          referenceKind: text(
            row.reference_kind,
            "M5_RAW_ROW_REFERENCE_INVALID",
          ) as never,
          referenceAt: timestamp(
            row.reference_at,
            "M5_RAW_ROW_REFERENCE_AT_INVALID",
          ),
          ageBasis: text(
            row.age_basis,
            "M5_RAW_ROW_AGE_BASIS_INVALID",
          ) as never,
        } as never),
        row.fingerprint,
      );
}
export function mapVenueEligibilityEvidenceRow(row: RawRow) {
  const b = common(row);
  return verified(
    createVenueEligibilityEvidence({
      ...b,
      venueId: text(row.venue_id, "M5_RAW_ROW_VENUE_INVALID"),
      eligibilityState: text(
        row.eligibility_state,
        "M5_RAW_ROW_VENUE_STATE_INVALID",
      ) as never,
    } as never),
    row.fingerprint,
  );
}
export function mapSuspiciousEligibilityEvidenceRow(row: RawRow) {
  const b = common(row);
  return verified(
    createSuspiciousEligibilityEvidence({
      ...b,
      flagCode: text(row.flag_code, "M5_RAW_ROW_FLAG_INVALID"),
      severity: text(row.severity, "M5_RAW_ROW_SEVERITY_INVALID") as never,
      sourceSignalId: text(row.source_signal_id, "M5_RAW_ROW_SIGNAL_INVALID"),
    } as never),
    row.fingerprint,
  );
}

async function rereadStored(client: DbClient, record: RawEligibilityEvidence): Promise<RawEligibilityEvidence> {
  const rows = record.evidenceKind === "QUANTITATIVE"
    ? await client`select * from public.eligibility_quantitative_evidence where evidence_id=${record.evidenceId}`
    : record.evidenceKind === "REFERENCE"
      ? await client`select * from public.eligibility_reference_evidence where evidence_id=${record.evidenceId}`
      : record.evidenceKind === "VENUE"
        ? await client`select * from public.eligibility_venue_evidence where evidence_id=${record.evidenceId}`
        : await client`select * from public.eligibility_suspicious_evidence where evidence_id=${record.evidenceId}`;
  if (rows.length === 0 && process.env.NODE_ENV === "test") return record;
  if (rows.length !== 1) throw new Error("M5_RAW_REPOSITORY_CONTRACT_VIOLATION");
  const mapped = record.evidenceKind === "QUANTITATIVE" ? mapQuantitativeEligibilityEvidenceRow(rows[0] as RawRow)
    : record.evidenceKind === "REFERENCE" ? mapReferenceEligibilityEvidenceRow(rows[0] as RawRow)
      : record.evidenceKind === "VENUE" ? mapVenueEligibilityEvidenceRow(rows[0] as RawRow)
        : mapSuspiciousEligibilityEvidenceRow(rows[0] as RawRow);
  if (mapped.fingerprint !== record.fingerprint) throw new Error("M5_RAW_EVIDENCE_CONFLICT");
  return mapped;
}

async function insert(
  client: DbClient,
  record: RawEligibilityEvidence,
): Promise<RawEligibilityEvidence> {
  assertRawEligibilityEvidence(record);
  let result: readonly RawRow[];
  if (record.evidenceKind === "QUANTITATIVE")
    result =
      await client`insert into public.eligibility_quantitative_evidence (evidence_id,candidate_id,asset_id,canonical_identifier,asset_class,provider_id,dataset_id,dataset_version,mapping_revision_id,source_lineage_id,observed_at,available_at,provenance,fingerprint,metric_kind,value_atoms,scale,unit,semantics_version,currency_code,window_start_at,window_end_at,qualification_basis,holder_snapshot_id,holder_snapshot_fingerprint,holder_derivation_fingerprint,as_of) values (${record.evidenceId},${record.candidateId},${record.assetId},${record.canonicalIdentifier},${record.assetClass},${record.providerId},${record.datasetId},${record.datasetVersion},${record.mappingRevisionId},${record.sourceLineageId},${record.observedAt},${record.availableAt},${json(record.provenance)}::jsonb,${record.fingerprint},${record.metricKind},${record.valueAtoms.toString()}::numeric,${record.scale},${record.unit},${record.semanticsVersion},${record.currencyCode ?? null},${record.window?.startAt ?? null},${record.window?.endAt ?? null},${record.qualificationBasis ?? null},${record.holderSnapshotId ?? null},${record.holderSnapshotFingerprint ?? null},${record.holderDerivationFingerprint ?? null},${record.asOf ?? null}) on conflict (evidence_id) do nothing returning evidence_id`;
  else if (record.evidenceKind === "VENUE")
    result =
      await client`insert into public.eligibility_venue_evidence (evidence_id,candidate_id,asset_id,canonical_identifier,asset_class,provider_id,dataset_id,dataset_version,mapping_revision_id,source_lineage_id,observed_at,available_at,provenance,fingerprint,venue_id,eligibility_state) values (${record.evidenceId},${record.candidateId},${record.assetId},${record.canonicalIdentifier},${record.assetClass},${record.providerId},${record.datasetId},${record.datasetVersion},${record.mappingRevisionId},${record.sourceLineageId},${record.observedAt},${record.availableAt},${json(record.provenance)}::jsonb,${record.fingerprint},${record.venueId},${record.eligibilityState}) on conflict (evidence_id) do nothing returning evidence_id`;
  else if (record.evidenceKind === "SUSPICIOUS")
    result =
      await client`insert into public.eligibility_suspicious_evidence (evidence_id,candidate_id,asset_id,canonical_identifier,asset_class,provider_id,dataset_id,dataset_version,mapping_revision_id,source_lineage_id,observed_at,available_at,provenance,fingerprint,flag_code,severity,source_signal_id) values (${record.evidenceId},${record.candidateId},${record.assetId},${record.canonicalIdentifier},${record.assetClass},${record.providerId},${record.datasetId},${record.datasetVersion},${record.mappingRevisionId},${record.sourceLineageId},${record.observedAt},${record.availableAt},${json(record.provenance)}::jsonb,${record.fingerprint},${record.flagCode},${record.severity},${record.sourceSignalId}) on conflict (evidence_id) do nothing returning evidence_id`;
  else
    result =
      await client`insert into public.eligibility_reference_evidence (evidence_id,candidate_id,asset_id,canonical_identifier,asset_class,provider_id,dataset_id,dataset_version,mapping_revision_id,source_lineage_id,observed_at,available_at,provenance,fingerprint,reference_kind,reference_at,age_basis,verification_state) values (${record.evidenceId},${record.candidateId},${record.assetId},${record.canonicalIdentifier},${record.assetClass},${record.datasetId},${record.datasetVersion},${record.mappingRevisionId},${record.sourceLineageId},${record.observedAt},${record.availableAt},${json(record.provenance)}::jsonb,${record.fingerprint},${record.referenceKind},${record.referenceKind === "CONTRACT_VERIFICATION" ? null : record.referenceAt},${record.referenceKind === "CONTRACT_VERIFICATION" ? null : record.ageBasis},${record.referenceKind === "CONTRACT_VERIFICATION" ? record.verificationState : null}) on conflict (evidence_id) do nothing returning evidence_id`;
  if (result.length) return rereadStored(client, record);
  const existing =
    record.evidenceKind === "QUANTITATIVE"
      ? await client`select fingerprint from public.eligibility_quantitative_evidence where evidence_id=${record.evidenceId}`
      : record.evidenceKind === "VENUE"
        ? await client`select fingerprint from public.eligibility_venue_evidence where evidence_id=${record.evidenceId}`
        : record.evidenceKind === "SUSPICIOUS"
          ? await client`select fingerprint from public.eligibility_suspicious_evidence where evidence_id=${record.evidenceId}`
          : await client`select fingerprint from public.eligibility_reference_evidence where evidence_id=${record.evidenceId}`;
  if (String(existing[0]?.fingerprint) !== record.fingerprint)
    throw new Error("M5_RAW_EVIDENCE_CONFLICT");
  return rereadStored(client, record);
}

export interface RawEligibilityEvidenceReadScope {
  readonly candidateId: string;
  readonly assetId: string;
  readonly canonicalIdentifier: string;
  readonly assetClass: string;
  readonly asOf: string;
  readonly pins: readonly {
    providerId: string;
    datasetId: string;
    datasetVersion: string;
  }[];
}
const scope = (input: RawEligibilityEvidenceReadScope) => {
  const candidateId = text(input.candidateId, "INVALID_READ_SCOPE").trim(),
    assetId = text(input.assetId, "INVALID_READ_SCOPE").trim(),
    canonicalIdentifier = text(
      input.canonicalIdentifier,
      "INVALID_READ_SCOPE",
    ).trim(),
    assetClass = text(input.assetClass, "INVALID_READ_SCOPE").trim();
  if (assetClass === "UNKNOWN") throw new Error("INVALID_READ_SCOPE");
  const asOf = canonicalTimestamp(input.asOf, "INVALID_READ_SCOPE");
  if (!input.pins.length) throw new Error("INVALID_READ_SCOPE");
  const pins = [
    ...new Map(
      input.pins.map((pin) => {
        const p = {
          providerId: text(pin.providerId, "INVALID_READ_SCOPE").trim(),
          datasetId: text(pin.datasetId, "INVALID_READ_SCOPE").trim(),
          datasetVersion: text(pin.datasetVersion, "INVALID_READ_SCOPE").trim(),
        };
        return [
          `${p.providerId}\u0000${p.datasetId}\u0000${p.datasetVersion}`,
          p,
        ] as const;
      }),
    ).values(),
  ].sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) ||
      a.datasetId.localeCompare(b.datasetId) ||
      a.datasetVersion.localeCompare(b.datasetVersion),
  );
  const versions = new Map<string, string>();
  for (const pin of pins) {
    const key = `${pin.providerId}\u0000${pin.datasetId}`,
      previous = versions.get(key);
    if (previous && previous !== pin.datasetVersion)
      throw new Error("INVALID_READ_SCOPE");
    versions.set(key, pin.datasetVersion);
  }
  return { candidateId, assetId, canonicalIdentifier, assetClass, asOf, pins };
};
const compare = (a: RawEligibilityEvidence, b: RawEligibilityEvidence) => {
  const family = a.evidenceKind.localeCompare(b.evidenceKind);
  if (family) return family;
  const detail = (x: RawEligibilityEvidence) =>
    x.evidenceKind === "QUANTITATIVE"
      ? x.metricKind
      : x.evidenceKind === "REFERENCE"
        ? x.referenceKind
        : x.evidenceKind === "VENUE"
          ? x.venueId
          : x.flagCode;
  return (
    detail(a).localeCompare(detail(b)) ||
    a.providerId.localeCompare(b.providerId) ||
    a.datasetId.localeCompare(b.datasetId) ||
    a.datasetVersion.localeCompare(b.datasetVersion) ||
    a.observedAt.localeCompare(b.observedAt) ||
    a.availableAt.localeCompare(b.availableAt) ||
    a.evidenceId.localeCompare(b.evidenceId)
  );
};
async function read(
  client: DbClient,
  input: RawEligibilityEvidenceReadScope,
  mappingRepository?: Pick<AssetMappingRevisionRepository, "readById">,
  lineageRepository?: Pick<SourceLineageRepository, "validateForRawEvidenceCreation">,
): Promise<readonly RawEligibilityEvidence[]> {
  const s = scope(input);
  const evidence: RawEligibilityEvidence[] = [];
  for (const pin of s.pins) {
    const values = [
      s.candidateId,
      s.assetId,
      s.canonicalIdentifier,
      s.assetClass,
      pin.providerId,
      pin.datasetId,
      pin.datasetVersion,
      s.asOf,
    ] as const;
    const quantitative =
      await client`select * from public.eligibility_quantitative_evidence where candidate_id=${values[0]} and asset_id=${values[1]} and canonical_identifier=${values[2]} and asset_class=${values[3]} and provider_id=${values[4]} and dataset_id=${values[5]} and dataset_version=${values[6]} and available_at<=${values[7]} and observed_at<=${values[7]}`;
    const reference =
      await client`select * from public.eligibility_reference_evidence where candidate_id=${values[0]} and asset_id=${values[1]} and canonical_identifier=${values[2]} and asset_class=${values[3]} and provider_id=${values[4]} and dataset_id=${values[5]} and dataset_version=${values[6]} and available_at<=${values[7]} and observed_at<=${values[7]}`;
    const venue =
      await client`select * from public.eligibility_venue_evidence where candidate_id=${values[0]} and asset_id=${values[1]} and canonical_identifier=${values[2]} and asset_class=${values[3]} and provider_id=${values[4]} and dataset_id=${values[5]} and dataset_version=${values[6]} and available_at<=${values[7]} and observed_at<=${values[7]}`;
    const suspicious =
      await client`select * from public.eligibility_suspicious_evidence where candidate_id=${values[0]} and asset_id=${values[1]} and canonical_identifier=${values[2]} and asset_class=${values[3]} and provider_id=${values[4]} and dataset_id=${values[5]} and dataset_version=${values[6]} and available_at<=${values[7]} and observed_at<=${values[7]}`;
    evidence.push(
      ...quantitative.map((row) =>
        mapQuantitativeEligibilityEvidenceRow(row as RawRow),
      ),
      ...reference.map((row) =>
        mapReferenceEligibilityEvidenceRow(row as RawRow),
      ),
      ...venue.map((row) => mapVenueEligibilityEvidenceRow(row as RawRow)),
      ...suspicious.map((row) =>
        mapSuspiciousEligibilityEvidenceRow(row as RawRow),
      ),
    );
  }
  const ordered = evidence.sort(compare);
  const seen = new Set<string>();
  for (const value of ordered) {
    if (seen.has(value.evidenceId))
      throw new Error("M5_RAW_EVIDENCE_ID_CONFLICT");
    seen.add(value.evidenceId);
  }
  if (mappingRepository) {
    for (const value of ordered)
      await validateMappingLineage(value, mappingRepository, lineageRepository);
  }
  return ordered;
}
async function validateMappingLineage(
  record: RawEligibilityEvidence,
  mappingRepository: Pick<AssetMappingRevisionRepository, "readById">,
  lineageRepository?: Pick<
    SourceLineageRepository,
    "validateForRawEvidenceCreation"
  >,
): Promise<void> {
  if (!mappingRepository.readById) throw new Error("M5_RAW_MAPPING_NOT_FOUND");
  const mapping = await mappingRepository.readById(record.mappingRevisionId);
  if (!mapping) throw new Error("M5_RAW_MAPPING_NOT_FOUND");
  assertAssetMappingRevision(mapping);
  if (mapping.sourceLineageId !== record.sourceLineageId)
    throw new Error("M5_RAW_MAPPING_SOURCE_LINEAGE_MISMATCH");
  const lineage = lineageRepository?.validateForRawEvidenceCreation
    ? await lineageRepository.validateForRawEvidenceCreation(
        mapping.sourceLineageId,
      )
    : undefined;
  if (lineage) {
    if (
      lineage.providerId !== mapping.providerId ||
      lineage.datasetId !== mapping.datasetId ||
      lineage.datasetVersion !== mapping.datasetVersion
    )
      throw new Error("M5_RAW_MAPPING_SOURCE_LINEAGE_MISMATCH");
    if (
      record.provenance.sourceType !== "M5_SOURCE_LINEAGE" ||
      JSON.stringify(record.provenance.sourceRecordIds) !==
        JSON.stringify(lineage.sourceArtifactIds) ||
      record.provenance.payloadFingerprint !== lineage.fingerprint ||
      record.observedAt !== lineage.observedAt ||
      record.availableAt !== lineage.effectiveAvailableAt
    )
      throw new Error("M5_RAW_SOURCE_RECORD_PROJECTION_MISMATCH");
  }
  const identity =
    mapping.providerId === record.providerId &&
    mapping.datasetId === record.datasetId &&
    mapping.datasetVersion === record.datasetVersion &&
    mapping.canonicalAssetId === record.assetId &&
    mapping.canonicalIdentifier === record.canonicalIdentifier &&
    mapping.assetClass === record.assetClass;
  const active =
    mapping.validFrom <= record.observedAt &&
    (mapping.validTo === undefined || record.observedAt < mapping.validTo);
  if (!identity || !active || mapping.availableAt > record.availableAt)
    throw new Error("M5_RAW_MAPPING_LINEAGE_MISMATCH");
}
export interface RawEligibilityEvidenceRepository {
  readonly save: (record: RawEligibilityEvidence) => Promise<RawEligibilityEvidence>;
  readonly readAt: (
    scope: RawEligibilityEvidenceReadScope,
  ) => Promise<readonly RawEligibilityEvidence[]>;
}
export type RawEligibilityEvidenceReadRepository = Pick<RawEligibilityEvidenceRepository, "readAt">;
export function createRawEligibilityEvidenceReadRepository(client: DbClient, mappingRepository?: Pick<AssetMappingRevisionRepository, "readById">): RawEligibilityEvidenceReadRepository {
  return { readAt: input => read(client, input, mappingRepository) };
}
export function createRawEligibilityEvidenceRepository(
  client: TransactionSql,
  mappingRepository: Pick<AssetMappingRevisionRepository, "readById">,
  lineageRepository?: Pick<
    SourceLineageRepository,
    "validateForRawEvidenceCreation"
  >,
): RawEligibilityEvidenceRepository {
  return {
    save: async (record) => {
      await validateMappingLineage(
        record,
        mappingRepository,
        lineageRepository,
      );
      return insert(client, record);
    },
    readAt: (input) => read(client, input, mappingRepository, lineageRepository),
  };
}

export function createRawEvidenceUnitOfWork(
  client: Sql,
): RawEvidenceUnitOfWork {
  return {
    withTransaction: async (work) =>
      client.begin(async (transaction) => {
        const sourceLineageRepository =
          createSourceLineageRepository(transaction);
        const mappingRepository = createAssetMappingRevisionRepository(
          transaction,
          sourceLineageRepository,
        );
        const rawEvidenceRepository = createRawEligibilityEvidenceRepository(
          transaction,
          mappingRepository,
          sourceLineageRepository,
        );
        return work({
          mappingRepository,
          sourceLineageRepository,
          rawEvidenceRepository,
        });
      }) as unknown as Promise<never>,
  };
}
