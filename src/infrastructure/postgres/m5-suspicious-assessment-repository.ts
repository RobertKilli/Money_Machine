import "server-only";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { assertM5SuspiciousAssessment, createM5SuspiciousAssessment, type M5SuspiciousAssessment, type M5SuspiciousFindingReference } from "@/domain/intelligence/m5-suspicious-assessment";
import { createSuspiciousEligibilityEvidence, type SuspiciousEligibilityEvidence, type SuspiciousEvidenceSeverity } from "@/domain/intelligence/eligibility-evidence";
import { createSourceLineageRepository } from "@/infrastructure/postgres/source-lineage-repository";
import { createAssetMappingRevisionRepository } from "@/infrastructure/postgres/asset-mapping-revision-repository";
import { createProviderAssetIdentityReadRepository } from "@/infrastructure/postgres/provider-asset-identity-repository";
import type { M5SuspiciousAssessmentRepositories, M5SuspiciousAssessmentUnitOfWork } from "@/application/intelligence/m5-suspicious-assessment-repository";
import type { M5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";

type RawRow = Record<string, unknown>;
const text = (value: unknown, code: string): string => { if (typeof value !== "string" || !value.trim()) throw new Error(code); return value.trim(); };
const timestamp = (value: unknown, code: string): string => { const result = value instanceof Date ? value.toISOString() : text(value, code); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) throw new Error(code); return result; };
const json = (value: unknown): string => JSON.stringify(value);
const SHA = /^[a-f0-9]{64}$/;
const array = (value: unknown, code: string): readonly string[] => { if (!Array.isArray(value)) throw new Error(code); return Object.freeze(value.map(item => text(item, code))); };
const references = (value: unknown): readonly M5SuspiciousFindingReference[] => { if (!Array.isArray(value)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_ROW_FINDINGS_INVALID"); return Object.freeze(value.map(item => { if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_ROW_FINDINGS_INVALID"); const record = item as Record<string, unknown>; return Object.freeze({ evidenceId: text(record.evidenceId, "M5_SUSPICIOUS_ASSESSMENT_ROW_FINDING_ID_INVALID"), fingerprint: text(record.fingerprint, "M5_SUSPICIOUS_ASSESSMENT_ROW_FINDING_FINGERPRINT_INVALID") }); })); };

export function mapM5SuspiciousAssessmentRow(row: RawRow): M5SuspiciousAssessment {
  const record = createM5SuspiciousAssessment({
    contractVersion: text(row.contract_version, "M5_SUSPICIOUS_ASSESSMENT_ROW_CONTRACT_INVALID") as "m5-suspicious-assessment/v1",
    suspiciousAssessmentId: text(row.suspicious_assessment_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_ID_INVALID"),
    fingerprint: text(row.fingerprint, "M5_SUSPICIOUS_ASSESSMENT_ROW_FINGERPRINT_INVALID"),
    providerId: text(row.provider_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_PROVIDER_INVALID"),
    datasetId: text(row.dataset_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_DATASET_INVALID"),
    datasetVersion: text(row.dataset_version, "M5_SUSPICIOUS_ASSESSMENT_ROW_VERSION_INVALID"),
    candidateId: text(row.candidate_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_CANDIDATE_INVALID"),
    assetId: text(row.asset_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_ASSET_INVALID"),
    canonicalIdentifier: text(row.canonical_identifier, "M5_SUSPICIOUS_ASSESSMENT_ROW_IDENTIFIER_INVALID"),
    assetClass: text(row.asset_class, "M5_SUSPICIOUS_ASSESSMENT_ROW_CLASS_INVALID"),
    mappingRevisionId: text(row.mapping_revision_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_MAPPING_INVALID"),
    sourceLineageId: text(row.source_lineage_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_LINEAGE_INVALID"),
    ruleSetVersion: text(row.rule_set_version, "M5_SUSPICIOUS_ASSESSMENT_ROW_RULE_SET_INVALID"),
    ruleSetFingerprint: text(row.rule_set_fingerprint, "M5_SUSPICIOUS_ASSESSMENT_ROW_RULE_SET_FINGERPRINT_INVALID"),
    ...(row.rule_set_authority_id == null ? {} : { ruleSetAuthorityId: text(row.rule_set_authority_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_RULE_SET_AUTHORITY_INVALID") }),
    ...(row.coverage_authority_id == null ? {} : { coverageAuthorityId: text(row.coverage_authority_id, "M5_SUSPICIOUS_ASSESSMENT_ROW_COVERAGE_AUTHORITY_INVALID") }),
    ...(row.coverage_fingerprint == null ? {} : { coverageFingerprint: text(row.coverage_fingerprint, "M5_SUSPICIOUS_ASSESSMENT_ROW_COVERAGE_FINGERPRINT_INVALID") }),
    ...(row.evaluated_rule_count == null ? {} : { evaluatedRuleCount: Number(row.evaluated_rule_count) }),
    detectorVersion: text(row.detector_version, "M5_SUSPICIOUS_ASSESSMENT_ROW_DETECTOR_INVALID"),
    coveredRuleIds: array(row.covered_rule_ids, "M5_SUSPICIOUS_ASSESSMENT_ROW_RULES_INVALID"),
    result: text(row.result, "M5_SUSPICIOUS_ASSESSMENT_ROW_RESULT_INVALID") as M5SuspiciousAssessment["result"],
    findingReferences: references(row.finding_references),
    asOf: timestamp(row.as_of, "M5_SUSPICIOUS_ASSESSMENT_ROW_AS_OF_INVALID"),
    observedAt: timestamp(row.observed_at, "M5_SUSPICIOUS_ASSESSMENT_ROW_OBSERVED_INVALID"),
    availableAt: timestamp(row.available_at, "M5_SUSPICIOUS_ASSESSMENT_ROW_AVAILABLE_INVALID"),
    sourceRecordIds: array(row.source_record_ids, "M5_SUSPICIOUS_ASSESSMENT_ROW_SOURCE_RECORDS_INVALID"),
    payloadFingerprint: text(row.payload_fingerprint, "M5_SUSPICIOUS_ASSESSMENT_ROW_PAYLOAD_INVALID"),
    datasetPins: array(row.dataset_pins, "M5_SUSPICIOUS_ASSESSMENT_ROW_PINS_INVALID"),
    recordedAt: timestamp(row.recorded_at, "M5_SUSPICIOUS_ASSESSMENT_ROW_RECORDED_INVALID"),
  });
  return record;
}

function mapFindingRow(row: RawRow): SuspiciousEligibilityEvidence {
  const provenance = row.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDING_PROVENANCE_INVALID");
  const p = provenance as Record<string, unknown>;
  return createSuspiciousEligibilityEvidence({
    evidenceId: text(row.evidence_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_ID_INVALID"), candidateId: text(row.candidate_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_CANDIDATE_INVALID"), assetId: text(row.asset_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_ASSET_INVALID"), canonicalIdentifier: text(row.canonical_identifier, "M5_SUSPICIOUS_ASSESSMENT_FINDING_IDENTIFIER_INVALID"), assetClass: text(row.asset_class, "M5_SUSPICIOUS_ASSESSMENT_FINDING_CLASS_INVALID"), providerId: text(row.provider_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_PROVIDER_INVALID"), datasetId: text(row.dataset_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_DATASET_INVALID"), datasetVersion: text(row.dataset_version, "M5_SUSPICIOUS_ASSESSMENT_FINDING_VERSION_INVALID"), mappingRevisionId: text(row.mapping_revision_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_MAPPING_INVALID"), sourceLineageId: text(row.source_lineage_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_LINEAGE_INVALID"), observedAt: timestamp(row.observed_at, "M5_SUSPICIOUS_ASSESSMENT_FINDING_OBSERVED_INVALID"), availableAt: timestamp(row.available_at, "M5_SUSPICIOUS_ASSESSMENT_FINDING_AVAILABLE_INVALID"), provenance: { sourceType: text(p.sourceType, "M5_SUSPICIOUS_ASSESSMENT_FINDING_SOURCE_TYPE_INVALID"), sourceRecordIds: array(p.sourceRecordIds, "M5_SUSPICIOUS_ASSESSMENT_FINDING_SOURCE_RECORDS_INVALID"), payloadFingerprint: text(p.payloadFingerprint, "M5_SUSPICIOUS_ASSESSMENT_FINDING_PAYLOAD_INVALID") }, flagCode: text(row.flag_code, "M5_SUSPICIOUS_ASSESSMENT_FINDING_FLAG_INVALID"), severity: text(row.severity, "M5_SUSPICIOUS_ASSESSMENT_FINDING_SEVERITY_INVALID") as SuspiciousEvidenceSeverity, sourceSignalId: text(row.source_signal_id, "M5_SUSPICIOUS_ASSESSMENT_FINDING_SIGNAL_INVALID"),
  });
}

function repositories(client: TransactionSql, ruleSets: M5SuspiciousRuleSetAuthorityResolver): M5SuspiciousAssessmentRepositories {
  const assessments = {
    readById: async (assessmentId: string) => {
      const rows = await client`select * from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessmentId}`;
      return rows.length === 0 ? undefined : mapM5SuspiciousAssessmentRow(rows[0] as RawRow);
    },
    save: async (assessment: M5SuspiciousAssessment) => {
      assertM5SuspiciousAssessment(assessment);
      await client`insert into public.eligibility_suspicious_assessments (suspicious_assessment_id,contract_version,fingerprint,provider_id,dataset_id,dataset_version,candidate_id,asset_id,canonical_identifier,asset_class,mapping_revision_id,source_lineage_id,rule_set_version,rule_set_fingerprint,rule_set_authority_id,coverage_authority_id,coverage_fingerprint,evaluated_rule_count,detector_version,covered_rule_ids,result,finding_references,as_of,observed_at,available_at,source_record_ids,payload_fingerprint,dataset_pins,recorded_at) values (${assessment.suspiciousAssessmentId},${assessment.contractVersion},${assessment.fingerprint},${assessment.providerId},${assessment.datasetId},${assessment.datasetVersion},${assessment.candidateId},${assessment.assetId},${assessment.canonicalIdentifier},${assessment.assetClass},${assessment.mappingRevisionId},${assessment.sourceLineageId},${assessment.ruleSetVersion},${assessment.ruleSetFingerprint},${assessment.ruleSetAuthorityId ?? null},${assessment.coverageAuthorityId ?? null},${assessment.coverageFingerprint ?? null},${assessment.evaluatedRuleCount ?? null},${assessment.detectorVersion},${json(assessment.coveredRuleIds)}::jsonb,${assessment.result},${json(assessment.findingReferences)}::jsonb,${assessment.asOf},${assessment.observedAt},${assessment.availableAt},${json(assessment.sourceRecordIds)}::jsonb,${assessment.payloadFingerprint},${json(assessment.datasetPins)}::jsonb,${assessment.recordedAt}) on conflict (suspicious_assessment_id) do nothing`;
      const stored = await assessments.readById(assessment.suspiciousAssessmentId);
      if (!stored) throw new Error("M5_SUSPICIOUS_ASSESSMENT_REREAD_NOT_FOUND");
      if (stored.fingerprint !== assessment.fingerprint) throw new Error("M5_SUSPICIOUS_ASSESSMENT_CONFLICT");
      return stored;
    },
  };
  const memberships = {
    readByAssessmentId: async (assessmentId: string) => {
      const rows = await client`select evidence_id,evidence_fingerprint,member_ordinal from public.eligibility_suspicious_assessment_findings where suspicious_assessment_id=${assessmentId} order by member_ordinal asc`;
      return Object.freeze(rows.map((value, index) => { const row = value as RawRow; if (Number(row.member_ordinal) !== index) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_ORDINAL_INVALID"); const fingerprint = text(row.evidence_fingerprint, "M5_SUSPICIOUS_ASSESSMENT_MEMBER_FINGERPRINT_INVALID"); if (!SHA.test(fingerprint)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_FINGERPRINT_INVALID"); return Object.freeze({ evidenceId: text(row.evidence_id, "M5_SUSPICIOUS_ASSESSMENT_MEMBER_ID_INVALID"), fingerprint }); }));
    },
    save: async (assessment: M5SuspiciousAssessment, members: readonly M5SuspiciousFindingReference[]) => {
      const normalized = [...members].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
      if (JSON.stringify(normalized) !== JSON.stringify(assessment.findingReferences)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_SET_INVALID");
      for (const [memberOrdinal, member] of normalized.entries()) await client`insert into public.eligibility_suspicious_assessment_findings (suspicious_assessment_id,member_ordinal,evidence_id,evidence_fingerprint,provider_id,dataset_id,dataset_version,candidate_id,asset_id,canonical_identifier,asset_class,mapping_revision_id,source_lineage_id) values (${assessment.suspiciousAssessmentId},${memberOrdinal},${member.evidenceId},${member.fingerprint},${assessment.providerId},${assessment.datasetId},${assessment.datasetVersion},${assessment.candidateId},${assessment.assetId},${assessment.canonicalIdentifier},${assessment.assetClass},${assessment.mappingRevisionId},${assessment.sourceLineageId}) on conflict do nothing`;
      const stored = await memberships.readByAssessmentId(assessment.suspiciousAssessmentId);
      if (JSON.stringify(stored) !== JSON.stringify(assessment.findingReferences)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_SET_INVALID");
      return stored;
    },
  };
  const findings = { readExact: async (scope: Parameters<M5SuspiciousAssessmentRepositories["findings"]["readExact"]>[0]) => {
    const rows = await client`select * from public.eligibility_suspicious_evidence where provider_id=${scope.providerId} and dataset_id=${scope.datasetId} and dataset_version=${scope.datasetVersion} and candidate_id=${scope.candidateId} and asset_id=${scope.assetId} and canonical_identifier=${scope.canonicalIdentifier} and asset_class=${scope.assetClass} and mapping_revision_id=${scope.mappingRevisionId} and source_lineage_id=${scope.sourceLineageId} and observed_at<=${scope.asOf} and available_at<=${scope.asOf} order by evidence_id asc`;
    const seen = new Set<string>();
    return Object.freeze(rows.map(value => { const finding = mapFindingRow(value as RawRow); if (seen.has(finding.evidenceId)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_DUPLICATE_FINDING"); seen.add(finding.evidenceId); return finding; }));
  } };
  const lineageRepository = createSourceLineageRepository(client);
  const assertionRepository = createProviderAssetIdentityReadRepository(client);
  const mappingRepository = createAssetMappingRevisionRepository(client, lineageRepository, assertionRepository);
  const readSealedById = async (assessmentId: string) => {
    const assessment = await assessments.readById(assessmentId);
    if (!assessment) return undefined;
    if (!mappingRepository.readById || !lineageRepository.validateForRawEvidenceCreation) throw new Error("M5_SUSPICIOUS_ASSESSMENT_AUTHORITY_READER_INVALID");
    const mapping = await mappingRepository.readById(assessment.mappingRevisionId);
    if (!mapping || mapping.providerId !== assessment.providerId || mapping.datasetId !== assessment.datasetId || mapping.datasetVersion !== assessment.datasetVersion || mapping.canonicalAssetId !== assessment.assetId || mapping.canonicalIdentifier !== assessment.canonicalIdentifier || mapping.assetClass !== assessment.assetClass || mapping.sourceLineageId !== assessment.sourceLineageId || mapping.payloadFingerprint !== assessment.payloadFingerprint || JSON.stringify(mapping.sourceRecordIds) !== JSON.stringify(assessment.sourceRecordIds) || mapping.observedAt !== assessment.observedAt || mapping.availableAt !== assessment.availableAt) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MAPPING_BINDING_INVALID");
    const lineage = await lineageRepository.validateForRawEvidenceCreation(assessment.sourceLineageId);
    if (lineage.providerId !== assessment.providerId || lineage.datasetId !== assessment.datasetId || lineage.datasetVersion !== assessment.datasetVersion || lineage.fingerprint !== assessment.payloadFingerprint || JSON.stringify(lineage.sourceArtifactIds) !== JSON.stringify(assessment.sourceRecordIds) || lineage.observedAt !== assessment.observedAt || lineage.effectiveAvailableAt !== assessment.availableAt) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_BINDING_INVALID");
    const members = await memberships.readByAssessmentId(assessmentId);
    if (JSON.stringify(members) !== JSON.stringify(assessment.findingReferences)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_SET_INVALID");
    return Object.freeze({ assessment, members });
  };
  return Object.freeze({ assessments: { ...assessments, readSealedById }, memberships, findings, mappings: { readById: async (id: string) => { if (!mappingRepository.readById) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MAPPING_READER_INVALID"); return mappingRepository.readById(id); } }, lineages: { validateForRawEvidenceCreation: async (id: string) => { if (!lineageRepository.validateForRawEvidenceCreation) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_READER_INVALID"); return lineageRepository.validateForRawEvidenceCreation(id); }, readMembers: lineageRepository.readMembers }, ruleSets });
}

export function createM5SuspiciousAssessmentUnitOfWork(client: Sql, ruleSets: M5SuspiciousRuleSetAuthorityResolver): M5SuspiciousAssessmentUnitOfWork {
  return Object.freeze({ withTransaction: <T>(work: (repositories: M5SuspiciousAssessmentRepositories) => Promise<T>) => client.begin(transaction => work(repositories(transaction, ruleSets))) as unknown as Promise<T> });
}

export function createM5SuspiciousAssessmentReadRepository(client: TransactionSql, ruleSets: M5SuspiciousRuleSetAuthorityResolver) {
  const value = repositories(client, ruleSets);
  return Object.freeze({ readById: value.assessments.readById, readSealedById: value.assessments.readSealedById, readMembers: value.memberships.readByAssessmentId });
}

/** Autocommit factory intentionally exposes reads only; no assessment writer is returned. */
export function createM5SuspiciousAssessmentAutocommitReadRepository(client: Sql) {
  const read = async (assessmentId: string) => {
    const rows = await client`select * from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessmentId}`;
    return rows.length === 0 ? undefined : mapM5SuspiciousAssessmentRow(rows[0] as RawRow);
  };
  const readMembers = async (assessmentId: string) => {
    const rows = await client`select evidence_id,evidence_fingerprint,member_ordinal from public.eligibility_suspicious_assessment_findings where suspicious_assessment_id=${assessmentId} order by member_ordinal asc`;
    return Object.freeze(rows.map((value, index) => { const row = value as RawRow; if (Number(row.member_ordinal) !== index) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_ORDINAL_INVALID"); const fingerprint = text(row.evidence_fingerprint, "M5_SUSPICIOUS_ASSESSMENT_MEMBER_FINGERPRINT_INVALID"); if (!SHA.test(fingerprint)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_FINGERPRINT_INVALID"); return Object.freeze({ evidenceId: text(row.evidence_id, "M5_SUSPICIOUS_ASSESSMENT_MEMBER_ID_INVALID"), fingerprint }); }));
  };
  return Object.freeze({ readById: read, readMembers, readSealedById: async (assessmentId: string) => client.begin(async transaction => {
    const scoped = repositories(transaction, { resolve: async () => undefined });
    return scoped.assessments.readSealedById(assessmentId);
  }) as unknown as Promise<Readonly<{ assessment: M5SuspiciousAssessment; members: readonly M5SuspiciousFindingReference[] }> | undefined> });
}

export const createM5SuspiciousAssessmentSql = (url: string): Sql => postgres(url, { max: 1, prepare: true, ssl: "require" });
