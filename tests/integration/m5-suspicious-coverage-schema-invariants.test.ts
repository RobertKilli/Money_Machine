import postgres from "postgres";
import type { TransactionSql } from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { buildManualIngestionToLineagePlan, executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";
import { createPostgresManualIngestionToLineageUnitOfWork } from "@/infrastructure/postgres/manual-ingestion-to-lineage-uow";
import { createProviderAssetIdentityAssertionAuthority } from "@/application/intelligence/create-provider-asset-identity-assertion";
import { createProviderAssetIdentityAssertionUnitOfWork } from "@/infrastructure/postgres/provider-asset-identity-repository";
import { createAssetMappingRevisionFromSourceLineage } from "@/application/intelligence/create-asset-mapping-revision-from-source-lineage";
import { createAssetMappingSourceLineageUnitOfWork } from "@/infrastructure/postgres/asset-mapping-revision-repository";
import { createM5SuspiciousRuleSetAuthority, createM5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";
import { createM5SuspiciousCoveragePersistenceUnitOfWork } from "@/infrastructure/postgres/m5-suspicious-coverage-repository";
import { createM5SuspiciousCoverageRepositories } from "@/infrastructure/postgres/m5-suspicious-coverage-repository";
import { createM5SuspiciousAssessmentUnitOfWork } from "@/infrastructure/postgres/m5-suspicious-assessment-repository";
import { createM5SuspiciousAssessmentReadRepository } from "@/infrastructure/postgres/m5-suspicious-assessment-repository";
import { createSourceLineageRepository } from "@/infrastructure/postgres/source-lineage-repository";
import { persistM5SuspiciousAssessmentWithCoverage } from "@/application/intelligence/create-m5-suspicious-assessment";
import { createRawEligibilityEvidenceFromMapping } from "@/application/intelligence/create-raw-eligibility-evidence-from-mapping";
import { createRawEvidenceUnitOfWork } from "@/infrastructure/postgres/eligibility-evidence-repository";
import { createM5SuspiciousCoverageAuthority, type M5SuspiciousCoverageMaterial } from "@/domain/intelligence/m5-suspicious-coverage";
import { createM5SuspiciousAssessment, type M5SuspiciousFindingReference } from "@/domain/intelligence/m5-suspicious-assessment";
import { encodeM5DatasetPin } from "@/domain/intelligence/m5-dataset-pin";

const url = process.env.DATABASE_URL;
const enabled = process.env.MONEY_MACHINE_SUSPICIOUS_COVERAGE_INTEGRATION === "1" && Boolean(url);
const assertLocal = (value: string) => {
  const host = new URL(value).hostname;
  if (!(["localhost", "127.0.0.1", "::1"] as const).includes(host as "localhost")) throw new Error("M5_SUSPICIOUS_INTEGRATION_REQUIRES_LOOPBACK");
};
const sha = (value: string) => value.repeat(64).slice(0, 64);
const runSeed = randomUUID();
const scoped = (caseName: string, kind: string) => `truth-${caseName}-${kind}-${createHash("sha256").update(`${runSeed}:${caseName}:${kind}`).digest("hex").slice(0, 16)}`;
const observedAt = "2026-03-01T00:00:00.000Z";
const asOf = "2026-03-02T00:00:00.000Z";
const packageValue = (caseName: string) => {
  const scope = scoped(caseName, "package");
  return { contractVersion: "m5-normalized-source-package/v1", idempotencyKey: `${scope}-request`, providerId: `${scope}-provider`, datasetId: `${scope}-dataset`, datasetVersion: "truth/v1", providerSourceNamespace: "truth", adapterContractVersion: "fixture/v1", adapterVersion: "fixture/v1", parserContractVersion: "normalized/v1", parserVersion: "normalized/v1", envelopeSchemaVersion: "fixture-envelope/v1", attemptNumber: 1, requestedAt: observedAt, startedAt: observedAt, recordedAt: asOf, requestScope: { scope: "local", runSeed }, provenance: { system: "fixture" }, executionInput: { fixture: true }, records: [0, 1].map(index => { const envelope = { kind: "truth", scope, index }; const selected = { index, scope }; return { providerExternalRecordId: `${scope}-record-${index}`, providerRevision: "fixture/v1", payloadFingerprint: canonicalSha256({ envelope, selected }), pageOrdinal: 0, itemOrdinal: index, retrievedAt: `2026-03-01T00:0${index + 1}:00.000Z`, recordedAt: asOf, observedAt, normalizedEnvelope: envelope, selectedAuditableFields: selected, metadata: { cursorSafety: "NONE" } }; }) };
};

type PersistedSuspiciousCoverageBaseline = Readonly<{
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  mappingRevisionId: string;
  providerAssetIdentityAssertionId: string;
  sourceLineageId: string;
  sourceLineageFingerprint: string;
  candidateId: string;
  assetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  asOf: string;
  observedAt: string;
  availableAt: string;
  ruleSetAuthorityId: string;
  ruleSetFingerprint: string;
  ruleSetVersion: string;
  detectorVersion: string;
  rules: readonly Readonly<{ ruleOrdinal: number; ruleId: string; ruleFingerprint: string }>[];
  lineageMembers: readonly Readonly<{
    ordinal: number;
    memberFingerprint: string;
    availabilityClaimId: string;
    availabilityClaimFingerprint: string;
    sourceArtifactId: string;
    sourceArtifactFingerprint: string;
    sourceEnvelopeId: string;
    sourceEnvelopeFingerprint: string;
    sourceObservationId: string;
    sourceObservationFingerprint: string;
    ingestionAttemptId: string;
    payloadFingerprint: string;
    observedAt: string;
    effectiveAvailableAt: string;
  }>[];
}>;

async function createPersistedSuspiciousCoverageBaseline(input: Readonly<{ sql: postgres.Sql; runSeed: string; caseName: string }>): Promise<PersistedSuspiciousCoverageBaseline> {
  const fixtureCase = `${input.caseName}-${createHash("sha256").update(`${input.runSeed}:${input.caseName}:baseline`).digest("hex").slice(0, 16)}`;
  const sourcePackage = packageValue(fixtureCase);
  await input.sql`insert into public.intelligence_providers (provider_id,name,provider_type,canonical_source,provenance_policy_version,content_storage_mode) values (${sourcePackage.providerId},${sourcePackage.providerId},'SYNTHETIC_FIXTURE','local','truth/v1','METADATA_ONLY') on conflict do nothing`;
  await input.sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values (${sourcePackage.datasetId},${sourcePackage.providerId},${sourcePackage.datasetVersion},'truth','METADATA_ONLY') on conflict do nothing`;
  let orderedPackage = sourcePackage;
  let plan = buildManualIngestionToLineagePlan(orderedPackage);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const orderedRecords = plan.records.map((record, index) => ({ claimId: record.claim.availabilityClaimId, record: orderedPackage.records[index]! })).sort((left, right) => left.claimId.localeCompare(right.claimId)).map(value => value.record);
    const nextPackage = { ...orderedPackage, records: orderedRecords };
    const nextPlan = buildManualIngestionToLineagePlan(nextPackage);
    orderedPackage = nextPackage;
    plan = nextPlan;
    const claimIds = plan.records.map(record => record.claim.availabilityClaimId);
    if (JSON.stringify(claimIds) === JSON.stringify([...claimIds].sort((left, right) => left.localeCompare(right)))) break;
  }
  const ingested = await executeManualIngestionToLineage(plan.package, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(input.sql) });
  if (ingested.status !== "PERSISTED") throw new Error("M5_TRUTH_LINEAGE_NOT_PERSISTED");
  const first = plan.records[0]!;
  const identity = await createProviderAssetIdentityAssertionAuthority({ unitOfWork: createProviderAssetIdentityAssertionUnitOfWork(input.sql), projection: { projectionVersion: "m5-provider-asset-identity-projection/v1", sourceArtifactId: first.artifact.sourceArtifactId, sourceEnvelopeId: first.envelope.sourceEnvelopeId, parserVersion: plan.package.parserVersion, envelopeSchemaVersion: plan.package.envelopeSchemaVersion, identity: { type: "EVM_CONTRACT_ADDRESS", namespace: "eip155:1", value: "0x" + "2".repeat(40) }, diagnostics: [] }, recordedAt: asOf });
  const mapping = await createAssetMappingRevisionFromSourceLineage({ unitOfWork: createAssetMappingSourceLineageUnitOfWork(input.sql), value: { sourceLineageId: ingested.sourceLineageId, providerAssetIdentityAssertionId: identity.providerAssetIdentityAssertionId, canonicalAssetId: `${scoped(fixtureCase, "asset")}`, canonicalIdentifier: `asset:${scoped(fixtureCase, "identifier")}`, assetClass: "CRYPTO", mappingRevisionVersion: "truth/v1", validFrom: observedAt, recordedAt: asOf } });
  const ruleSet = createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: `truth-rules/${fixtureCase}`, providerId: plan.package.providerId, datasetId: plan.package.datasetId, datasetVersion: plan.package.datasetVersion, detectorVersion: "truth-detector/v1", requiredRuleIds: ["RULE_A", "RULE_B"] });
  await createM5SuspiciousCoveragePersistenceUnitOfWork(input.sql).withTransaction(repositories => repositories.ruleSets.save(ruleSet));
  const persistedRuleSet = await createM5SuspiciousCoveragePersistenceUnitOfWork(input.sql).withTransaction(repositories => repositories.ruleSets.readById(ruleSet.ruleSetAuthorityId));
  if (!persistedRuleSet) throw new Error("M5_TRUTH_RULE_SET_REREAD_NOT_FOUND");
  return input.sql.begin(async tx => {
    const lineages = createSourceLineageRepository(tx);
    const lineage = await lineages.readById(ingested.sourceLineageId);
    if (!lineage) throw new Error("M5_TRUTH_LINEAGE_REREAD_NOT_FOUND");
    const members = await lineages.readMembers(lineage.sourceLineageId);
    if (!lineages.readMemberAuthorities) throw new Error("M5_TRUTH_LINEAGE_AUTHORITY_READER_MISSING");
    const authorities = await lineages.readMemberAuthorities(lineage.sourceLineageId);
    if (members.length !== authorities.length) throw new Error("M5_TRUTH_BASELINE_REREAD_INVALID");
    return Object.freeze({
      providerId: mapping.providerId,
      datasetId: mapping.datasetId,
      datasetVersion: mapping.datasetVersion,
      mappingRevisionId: mapping.mappingRevisionId,
      providerAssetIdentityAssertionId: mapping.providerAssetIdentityAssertionId,
      sourceLineageId: lineage.sourceLineageId,
      sourceLineageFingerprint: lineage.fingerprint,
      candidateId: scoped(fixtureCase, "candidate"),
      assetId: mapping.canonicalAssetId,
      canonicalIdentifier: mapping.canonicalIdentifier,
      assetClass: mapping.assetClass,
      asOf,
      observedAt: lineage.observedAt,
      availableAt: lineage.effectiveAvailableAt,
      ruleSetAuthorityId: persistedRuleSet.ruleSetAuthorityId,
      ruleSetFingerprint: persistedRuleSet.fingerprint,
      ruleSetVersion: persistedRuleSet.ruleSetVersion,
      detectorVersion: persistedRuleSet.detectorVersion,
      rules: Object.freeze(persistedRuleSet.rules.map((rule, ruleOrdinal) => Object.freeze({ ruleOrdinal, ruleId: rule.ruleId, ruleFingerprint: rule.fingerprint }))),
      lineageMembers: Object.freeze(members.map((member, index) => {
        const authority = authorities[index]!;
        return Object.freeze({ ordinal: member.memberOrdinal, memberFingerprint: member.memberFingerprint, availabilityClaimId: authority.claim.availabilityClaimId, availabilityClaimFingerprint: authority.claim.claimFingerprint, sourceArtifactId: authority.artifact.sourceArtifactId, sourceArtifactFingerprint: authority.artifact.sourceArtifactFingerprint, sourceEnvelopeId: authority.envelope.sourceEnvelopeId, sourceEnvelopeFingerprint: authority.envelope.sourceEnvelopeFingerprint, sourceObservationId: authority.observation.sourceObservationId, sourceObservationFingerprint: authority.observation.observationFingerprint, ingestionAttemptId: authority.attempt.ingestionAttemptId, payloadFingerprint: authority.artifact.payloadFingerprint, observedAt: authority.envelope.observedAt, effectiveAvailableAt: authority.observation.retrievedAt });
      })),
    });
  }) as unknown as Promise<PersistedSuspiciousCoverageBaseline>;
}

type CoverageParentInsertRow = Readonly<{
  coverageAuthorityId: string;
  contractVersion: "m5-suspicious-coverage-authority/v1";
  ruleSetAuthorityId: string;
  ruleSetFingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  mappingRevisionId: string;
  providerAssetIdentityAssertionId: string;
  sourceLineageId: string;
  sourceLineageFingerprint: string;
  candidateId: string;
  assetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  asOf: string;
  requiredRuleIds: readonly string[];
  evaluatedRuleIds: readonly string[];
  requiredRuleCount: number;
  evaluatedRuleCount: number;
  sourceMaterials: readonly M5SuspiciousCoverageMaterial[];
  coverageStatus: "COMPLETE" | "INCOMPLETE" | "INVALID";
  observedAt: string;
  availableAt: string;
  coverageFingerprint: string;
  recordedAt: string;
}>;

type CoverageInputInsertRow = Readonly<{
  coverageAuthorityId: string;
  ruleSetAuthorityId: string;
  ruleOrdinal: number;
  ruleId: string;
  ruleFingerprint: string;
  materialFingerprint: string;
  sourceLineageId: string;
  sourceLineageMemberOrdinal: number;
  sourceLineageMemberFingerprint: string;
  availabilityClaimId: string;
  availabilityClaimFingerprint: string;
  sourceArtifactId: string;
  sourceArtifactFingerprint: string;
  sourceEnvelopeId: string;
  sourceEnvelopeFingerprint: string;
  sourceObservationId: string;
  sourceObservationFingerprint: string;
  ingestionAttemptId: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  payloadFingerprint: string;
  observedAt: string;
  effectiveAvailableAt: string;
}>;

type AssessmentInsertRow = Readonly<{
  suspiciousAssessmentId: string;
  contractVersion: "m5-suspicious-assessment/v1";
  fingerprint: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  candidateId: string;
  assetId: string;
  canonicalIdentifier: string;
  assetClass: string;
  mappingRevisionId: string;
  sourceLineageId: string;
  ruleSetVersion: string;
  ruleSetFingerprint: string;
  ruleSetAuthorityId: string;
  coverageAuthorityId: string;
  coverageFingerprint: string;
  evaluatedRuleCount: number;
  coverageStatus: "COMPLETE";
  detectorVersion: string;
  coveredRuleIds: readonly string[];
  result: "NO_FINDINGS" | "FINDINGS_PRESENT";
  findingReferences: readonly M5SuspiciousFindingReference[];
  asOf: string;
  observedAt: string;
  availableAt: string;
  sourceRecordIds: readonly string[];
  payloadFingerprint: string;
  datasetPins: readonly string[];
  recordedAt: string;
}>;

function buildValidCoverageSqlFixture(input: Readonly<{ runSeed: string; caseName: string; baseline: PersistedSuspiciousCoverageBaseline }>): Readonly<{ parent: CoverageParentInsertRow; inputs: readonly CoverageInputInsertRow[] }> {
  const { baseline } = input;
  const materials = baseline.lineageMembers.map(member => Object.freeze({
    materialId: member.sourceArtifactId,
    sourceLineageId: baseline.sourceLineageId,
    sourceLineageMemberOrdinal: member.ordinal,
    sourceLineageMemberFingerprint: member.memberFingerprint,
    availabilityClaimId: member.availabilityClaimId,
    availabilityClaimFingerprint: member.availabilityClaimFingerprint,
    artifactId: member.sourceArtifactId,
    sourceArtifactFingerprint: member.sourceArtifactFingerprint,
    envelopeId: member.sourceEnvelopeId,
    envelopeFingerprint: member.sourceEnvelopeFingerprint,
    observationId: member.sourceObservationId,
    observationFingerprint: member.sourceObservationFingerprint,
    ingestionAttemptId: member.ingestionAttemptId,
    payloadFingerprint: member.payloadFingerprint,
    observedAt: member.observedAt,
    availableAt: member.effectiveAvailableAt,
  } satisfies M5SuspiciousCoverageMaterial));
  const requiredRuleIds = baseline.rules.map(rule => rule.ruleId).sort((left, right) => left.localeCompare(right));
  const coverage = createM5SuspiciousCoverageAuthority({
    contractVersion: "m5-suspicious-coverage-authority/v1",
    coverageAuthorityId: scoped(`${input.caseName}-${input.runSeed}`, "coverage"),
    ruleSetAuthorityId: baseline.ruleSetAuthorityId,
    ruleSetFingerprint: baseline.ruleSetFingerprint,
    providerId: baseline.providerId,
    datasetId: baseline.datasetId,
    datasetVersion: baseline.datasetVersion,
    mappingRevisionId: baseline.mappingRevisionId,
    providerAssetIdentityAssertionId: baseline.providerAssetIdentityAssertionId,
    sourceLineageId: baseline.sourceLineageId,
    sourceLineageFingerprint: baseline.sourceLineageFingerprint,
    candidateId: baseline.candidateId,
    assetId: baseline.assetId,
    canonicalIdentifier: baseline.canonicalIdentifier,
    assetClass: baseline.assetClass,
    asOf: baseline.asOf,
    requiredRuleIds,
    evaluatedRuleIds: requiredRuleIds,
    materials,
    status: "COMPLETE",
    observedAt: baseline.observedAt,
    availableAt: baseline.availableAt,
    recordedAt: asOf,
  });
  const ruleFingerprints = new Map(baseline.rules.map(rule => [rule.ruleId, rule.ruleFingerprint]));
  const inputs = coverage.evaluatedRuleIds.map((ruleId, ruleOrdinal) => {
    const material = coverage.materials[ruleOrdinal]!;
    const ruleFingerprint = ruleFingerprints.get(ruleId);
    if (!ruleFingerprint) throw new Error("M5_TRUTH_RULE_FINGERPRINT_NOT_FOUND");
    return Object.freeze({
      coverageAuthorityId: coverage.coverageAuthorityId,
      ruleSetAuthorityId: coverage.ruleSetAuthorityId,
      ruleOrdinal,
      ruleId,
      ruleFingerprint,
      materialFingerprint: canonicalSha256(material),
      sourceLineageId: material.sourceLineageId,
      sourceLineageMemberOrdinal: material.sourceLineageMemberOrdinal,
      sourceLineageMemberFingerprint: material.sourceLineageMemberFingerprint,
      availabilityClaimId: material.availabilityClaimId,
      availabilityClaimFingerprint: material.availabilityClaimFingerprint,
      sourceArtifactId: material.artifactId,
      sourceArtifactFingerprint: material.sourceArtifactFingerprint,
      sourceEnvelopeId: material.envelopeId,
      sourceEnvelopeFingerprint: material.envelopeFingerprint,
      sourceObservationId: material.observationId,
      sourceObservationFingerprint: material.observationFingerprint,
      ingestionAttemptId: material.ingestionAttemptId,
      providerId: coverage.providerId,
      datasetId: coverage.datasetId,
      datasetVersion: coverage.datasetVersion,
      payloadFingerprint: material.payloadFingerprint,
      observedAt: material.observedAt,
      effectiveAvailableAt: material.availableAt,
    });
  });
  return Object.freeze({
    parent: Object.freeze({ coverageAuthorityId: coverage.coverageAuthorityId, contractVersion: coverage.contractVersion, ruleSetAuthorityId: coverage.ruleSetAuthorityId, ruleSetFingerprint: coverage.ruleSetFingerprint, providerId: coverage.providerId, datasetId: coverage.datasetId, datasetVersion: coverage.datasetVersion, mappingRevisionId: coverage.mappingRevisionId, providerAssetIdentityAssertionId: coverage.providerAssetIdentityAssertionId, sourceLineageId: coverage.sourceLineageId, sourceLineageFingerprint: coverage.sourceLineageFingerprint, candidateId: coverage.candidateId, assetId: coverage.assetId, canonicalIdentifier: coverage.canonicalIdentifier, assetClass: coverage.assetClass, asOf: coverage.asOf, requiredRuleIds: coverage.requiredRuleIds, evaluatedRuleIds: coverage.evaluatedRuleIds, requiredRuleCount: coverage.requiredRuleIds.length, evaluatedRuleCount: coverage.evaluatedRuleIds.length, sourceMaterials: coverage.materials, coverageStatus: coverage.status, observedAt: coverage.observedAt, availableAt: coverage.availableAt, coverageFingerprint: coverage.fingerprint, recordedAt: coverage.recordedAt }),
    inputs: Object.freeze(inputs),
  });
}

async function insertCoverageParent(tx: TransactionSql, row: CoverageParentInsertRow): Promise<void> {
  await tx`insert into public.m5_suspicious_coverage_authorities (coverage_authority_id,contract_version,rule_set_authority_id,rule_set_fingerprint,provider_id,dataset_id,dataset_version,mapping_revision_id,provider_asset_identity_assertion_id,source_lineage_id,source_lineage_fingerprint,candidate_id,asset_id,canonical_identifier,asset_class,as_of,required_rule_ids,evaluated_rule_ids,required_rule_count,evaluated_rule_count,source_materials,coverage_status,observed_at,available_at,coverage_fingerprint,recorded_at) values (${row.coverageAuthorityId},${row.contractVersion},${row.ruleSetAuthorityId},${row.ruleSetFingerprint},${row.providerId},${row.datasetId},${row.datasetVersion},${row.mappingRevisionId},${row.providerAssetIdentityAssertionId},${row.sourceLineageId},${row.sourceLineageFingerprint},${row.candidateId},${row.assetId},${row.canonicalIdentifier},${row.assetClass},${row.asOf},${tx.json(row.requiredRuleIds)},${tx.json(row.evaluatedRuleIds)},${row.requiredRuleCount},${row.evaluatedRuleCount},${tx.json(row.sourceMaterials)},${row.coverageStatus},${row.observedAt},${row.availableAt},${row.coverageFingerprint},${row.recordedAt})`;
}

async function insertCoverageInput(tx: TransactionSql, row: CoverageInputInsertRow): Promise<void> {
  await tx`insert into public.m5_suspicious_coverage_rule_inputs (coverage_authority_id,rule_set_authority_id,rule_ordinal,rule_id,rule_fingerprint,material_fingerprint,source_lineage_id,source_lineage_member_ordinal,source_lineage_member_fingerprint,availability_claim_id,availability_claim_fingerprint,source_artifact_id,source_artifact_fingerprint,source_envelope_id,source_envelope_fingerprint,source_observation_id,source_observation_fingerprint,ingestion_attempt_id,provider_id,dataset_id,dataset_version,payload_fingerprint,observed_at,effective_available_at) values (${row.coverageAuthorityId},${row.ruleSetAuthorityId},${row.ruleOrdinal},${row.ruleId},${row.ruleFingerprint},${row.materialFingerprint},${row.sourceLineageId},${row.sourceLineageMemberOrdinal},${row.sourceLineageMemberFingerprint},${row.availabilityClaimId},${row.availabilityClaimFingerprint},${row.sourceArtifactId},${row.sourceArtifactFingerprint},${row.sourceEnvelopeId},${row.sourceEnvelopeFingerprint},${row.sourceObservationId},${row.sourceObservationFingerprint},${row.ingestionAttemptId},${row.providerId},${row.datasetId},${row.datasetVersion},${row.payloadFingerprint},${row.observedAt},${row.effectiveAvailableAt})`;
}

function buildValidAssessmentInsertRow(input: Readonly<{ baseline: PersistedSuspiciousCoverageBaseline; parent: CoverageParentInsertRow; result?: "NO_FINDINGS" | "FINDINGS_PRESENT"; findingReferences?: readonly M5SuspiciousFindingReference[] }>): AssessmentInsertRow {
  const assessment = createM5SuspiciousAssessment({
    contractVersion: "m5-suspicious-assessment/v1",
    providerId: input.baseline.providerId,
    datasetId: input.baseline.datasetId,
    datasetVersion: input.baseline.datasetVersion,
    candidateId: input.baseline.candidateId,
    assetId: input.baseline.assetId,
    canonicalIdentifier: input.baseline.canonicalIdentifier,
    assetClass: input.baseline.assetClass,
    mappingRevisionId: input.baseline.mappingRevisionId,
    sourceLineageId: input.baseline.sourceLineageId,
    ruleSetVersion: input.baseline.ruleSetVersion,
    ruleSetFingerprint: input.baseline.ruleSetFingerprint,
    ruleSetAuthorityId: input.baseline.ruleSetAuthorityId,
    coverageAuthorityId: input.parent.coverageAuthorityId,
    coverageFingerprint: input.parent.coverageFingerprint,
    evaluatedRuleCount: input.parent.evaluatedRuleCount,
    coverageStatus: "COMPLETE",
    detectorVersion: input.baseline.detectorVersion,
    coveredRuleIds: input.parent.evaluatedRuleIds,
    result: input.result ?? "NO_FINDINGS",
    findingReferences: input.findingReferences ?? [],
    asOf: input.baseline.asOf,
    observedAt: input.baseline.observedAt,
    availableAt: input.baseline.availableAt,
    sourceRecordIds: input.baseline.lineageMembers.map(member => member.sourceArtifactId),
    payloadFingerprint: input.baseline.sourceLineageFingerprint,
    datasetPins: [encodeM5DatasetPin({ providerId: input.baseline.providerId, datasetId: input.baseline.datasetId, datasetVersion: input.baseline.datasetVersion })],
    recordedAt: asOf,
  });
  return Object.freeze({ suspiciousAssessmentId: assessment.suspiciousAssessmentId, contractVersion: assessment.contractVersion, fingerprint: assessment.fingerprint, providerId: assessment.providerId, datasetId: assessment.datasetId, datasetVersion: assessment.datasetVersion, candidateId: assessment.candidateId, assetId: assessment.assetId, canonicalIdentifier: assessment.canonicalIdentifier, assetClass: assessment.assetClass, mappingRevisionId: assessment.mappingRevisionId, sourceLineageId: assessment.sourceLineageId, ruleSetVersion: assessment.ruleSetVersion, ruleSetFingerprint: assessment.ruleSetFingerprint, ruleSetAuthorityId: assessment.ruleSetAuthorityId!, coverageAuthorityId: assessment.coverageAuthorityId!, coverageFingerprint: assessment.coverageFingerprint!, evaluatedRuleCount: assessment.evaluatedRuleCount!, coverageStatus: assessment.coverageStatus!, detectorVersion: assessment.detectorVersion, coveredRuleIds: assessment.coveredRuleIds, result: assessment.result, findingReferences: assessment.findingReferences, asOf: assessment.asOf, observedAt: assessment.observedAt, availableAt: assessment.availableAt, sourceRecordIds: assessment.sourceRecordIds, payloadFingerprint: assessment.payloadFingerprint, datasetPins: assessment.datasetPins, recordedAt: assessment.recordedAt });
}

async function insertAssessment(tx: TransactionSql, row: AssessmentInsertRow): Promise<void> {
  await tx`insert into public.eligibility_suspicious_assessments (suspicious_assessment_id,contract_version,fingerprint,provider_id,dataset_id,dataset_version,candidate_id,asset_id,canonical_identifier,asset_class,mapping_revision_id,source_lineage_id,rule_set_version,rule_set_fingerprint,rule_set_authority_id,coverage_authority_id,coverage_fingerprint,evaluated_rule_count,coverage_status,detector_version,covered_rule_ids,result,finding_references,as_of,observed_at,available_at,source_record_ids,payload_fingerprint,dataset_pins,recorded_at) values (${row.suspiciousAssessmentId},${row.contractVersion},${row.fingerprint},${row.providerId},${row.datasetId},${row.datasetVersion},${row.candidateId},${row.assetId},${row.canonicalIdentifier},${row.assetClass},${row.mappingRevisionId},${row.sourceLineageId},${row.ruleSetVersion},${row.ruleSetFingerprint},${row.ruleSetAuthorityId},${row.coverageAuthorityId},${row.coverageFingerprint},${row.evaluatedRuleCount},${row.coverageStatus},${row.detectorVersion},${tx.json(row.coveredRuleIds)},${row.result},${tx.json(row.findingReferences)},${row.asOf},${row.observedAt},${row.availableAt},${tx.json(row.sourceRecordIds)},${row.payloadFingerprint},${tx.json(row.datasetPins)},${row.recordedAt})`;
}

async function insertAssessmentFinding(tx: TransactionSql, input: Readonly<{ assessment: AssessmentInsertRow; memberOrdinal: number; evidenceId: string; evidenceFingerprint: string }>): Promise<void> {
  const row = input.assessment;
  await tx`insert into public.eligibility_suspicious_assessment_findings (suspicious_assessment_id,member_ordinal,evidence_id,evidence_fingerprint,provider_id,dataset_id,dataset_version,candidate_id,asset_id,canonical_identifier,asset_class,mapping_revision_id,source_lineage_id) values (${row.suspiciousAssessmentId},${input.memberOrdinal},${input.evidenceId},${input.evidenceFingerprint},${row.providerId},${row.datasetId},${row.datasetVersion},${row.candidateId},${row.assetId},${row.canonicalIdentifier},${row.assetClass},${row.mappingRevisionId},${row.sourceLineageId})`;
}

async function expectNoAssessmentRows(sql: postgres.Sql, assessmentId: string): Promise<void> {
  const [assessments, findings] = await Promise.all([
    sql`select count(*)::int as count from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessmentId}`,
    sql`select count(*)::int as count from public.eligibility_suspicious_assessment_findings where suspicious_assessment_id=${assessmentId}`,
  ]);
  expect((assessments[0] as { count: number }).count).toBe(0);
  expect((findings[0] as { count: number }).count).toBe(0);
}

async function expectSqlState(work: () => Promise<unknown>, state: string) {
  try { await work(); throw new Error("M5_TEST_EXPECTED_DATABASE_FAILURE"); }
  catch (error) { expect((error as { code?: string }).code).toBe(state); }
}

describe.skipIf(!enabled)("M5 suspicious coverage schema invariants", () => {
  it("commits an exact rule count, defers incomplete writes, and rolls back count mismatches", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const valid = scoped("rule-count", "valid");
    try {
      await sql.begin(async tx => {
        await tx`insert into public.m5_suspicious_rule_set_authorities (rule_set_authority_id,contract_version,rule_set_version,provider_id,dataset_id,dataset_version,detector_version,rule_count,rule_set_fingerprint,recorded_at) values (${valid},'m5-suspicious-rule-set-authority/v1','v1','p','d','v1','detector',2,${sha("a")},'2026-01-01T00:00:00.000Z')`;
        await tx`insert into public.m5_suspicious_rule_set_rules (rule_set_authority_id,rule_ordinal,rule_id,rule_contract_version,enabled,required,rule_material,rule_fingerprint) values (${valid},0,'RULE_A','rule/v1',true,true,'{}'::jsonb,${sha("b")}),(${valid},1,'RULE_B','rule/v1',true,true,'{}'::jsonb,${sha("c")})`;
      });
      expect((await sql`select count(*)::int as count from public.m5_suspicious_rule_set_rules where rule_set_authority_id=${valid}`)[0]!.count).toBe(2);
      for (const [caseName, count, members] of [["low", 1, 2], ["high", 3, 2], ["missing", 2, 1], ["extra", 1, 2]] as const) {
        const id = scoped("rule-count", caseName);
        await expectSqlState(() => sql.begin(async tx => {
          await tx`insert into public.m5_suspicious_rule_set_authorities (rule_set_authority_id,contract_version,rule_set_version,provider_id,dataset_id,dataset_version,detector_version,rule_count,rule_set_fingerprint,recorded_at) values (${id},'m5-suspicious-rule-set-authority/v1',${id},'p','d','v1','detector',${count},${sha(id[11] ?? "d")},'2026-01-01T00:00:00.000Z')`;
          for (let ordinal = 0; ordinal < members; ordinal++) await tx`insert into public.m5_suspicious_rule_set_rules (rule_set_authority_id,rule_ordinal,rule_id,rule_contract_version,enabled,required,rule_material,rule_fingerprint) values (${id},${ordinal},${`RULE_${ordinal}`},'rule/v1',true,true,'{}'::jsonb,${sha(String(ordinal + 1))})`;
        }), "23514");
        expect((await sql`select count(*)::int as count from public.m5_suspicious_rule_set_authorities where rule_set_authority_id=${id}`)[0]!.count).toBe(0);
        expect((await sql`select count(*)::int as count from public.m5_suspicious_rule_set_rules where rule_set_authority_id=${id}`)[0]!.count).toBe(0);
      }
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("commits a direct-SQL COMPLETE coverage fixture with authoritative structured provenance", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "direct-sql-complete" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "direct-sql-complete", baseline });
      await sql.begin(async tx => {
        await insertCoverageParent(tx, fixture.parent);
        for (const input of fixture.inputs) await insertCoverageInput(tx, input);
      });
      const parents = await verify`select coverage_authority_id from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`;
      const inputs = await verify`select rule_ordinal,rule_id,source_lineage_id,availability_claim_id,source_artifact_id,source_envelope_id,source_observation_id,ingestion_attempt_id,provider_id,dataset_id,dataset_version from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId} order by rule_ordinal`;
      expect(parents).toHaveLength(1);
      expect(inputs).toHaveLength(fixture.inputs.length);
      const reread = await verify.begin(async tx => createM5SuspiciousCoverageRepositories(tx).coverage.readById(fixture.parent.coverageAuthorityId));
      expect(reread?.status).toBe("COMPLETE");
      expect(reread?.fingerprint).toBe(fixture.parent.coverageFingerprint);
      for (const [index, input] of fixture.inputs.entries()) {
        const persisted = inputs[index] as Record<string, unknown>;
        expect(String(persisted.rule_id)).toBe(input.ruleId);
        expect(String(persisted.source_lineage_id)).toBe(baseline.sourceLineageId);
        expect(String(persisted.availability_claim_id)).toBe(input.availabilityClaimId);
        expect(String(persisted.source_artifact_id)).toBe(input.sourceArtifactId);
        expect(String(persisted.source_envelope_id)).toBe(input.sourceEnvelopeId);
        expect(String(persisted.source_observation_id)).toBe(input.sourceObservationId);
        expect(String(persisted.ingestion_attempt_id)).toBe(input.ingestionAttemptId);
        expect(String(persisted.provider_id)).toBe(baseline.providerId);
        expect(String(persisted.dataset_id)).toBe(baseline.datasetId);
        expect(String(persisted.dataset_version)).toBe(baseline.datasetVersion);
      }
    } finally {
      await verify.end({ timeout: 5 });
      await sql.end({ timeout: 5 });
    }
  });
  it("rejects a COMPLETE direct-SQL coverage parent with a missing input at deferred commit", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "direct-sql-missing-input" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "direct-sql-missing-input", baseline });
      let failure: { readonly code?: string; readonly message?: string } | undefined;
      try {
        await sql.begin(async tx => {
          await insertCoverageParent(tx, fixture.parent);
          for (const input of fixture.inputs.slice(0, -1)) await insertCoverageInput(tx, input);
        });
      } catch (error) {
        failure = error as { readonly code?: string; readonly message?: string };
      }
      expect(failure?.code).toBe("23514");
      expect(failure?.message).toContain("M5_SUSPICIOUS_COMPLETE_COVERAGE_MEMBER_SET_INVALID");
      const parents = await verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`;
      const inputs = await verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`;
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally {
      await verify.end({ timeout: 5 });
      await sql.end({ timeout: 5 });
    }
  });
  it("rejects a COMPLETE coverage whose required set omits a persisted rule", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "missing-required-rule" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "missing-required-rule", baseline });
      const parent = Object.freeze({ ...fixture.parent, requiredRuleIds: fixture.parent.requiredRuleIds.slice(0, -1), evaluatedRuleIds: fixture.parent.evaluatedRuleIds.slice(0, -1), requiredRuleCount: 1, evaluatedRuleCount: 1, sourceMaterials: fixture.parent.sourceMaterials.slice(0, -1) });
      let failure: { readonly code?: string; readonly constraint_name?: string; readonly message?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, parent); await insertCoverageInput(tx, fixture.inputs[0]!); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23514");
      expect(failure?.message).toContain("M5_SUSPICIOUS_COMPLETE_COVERAGE_MEMBER_SET_INVALID");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a COMPLETE coverage whose required set includes an unpersisted rule", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "extra-required-rule" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "extra-required-rule", baseline });
      const extraRuleId = "RULE_UNPERSISTED";
      const parent = Object.freeze({ ...fixture.parent, requiredRuleIds: [...fixture.parent.requiredRuleIds, extraRuleId].sort((left, right) => left.localeCompare(right)), evaluatedRuleIds: [...fixture.parent.evaluatedRuleIds, extraRuleId].sort((left, right) => left.localeCompare(right)), requiredRuleCount: 3, evaluatedRuleCount: 3, sourceMaterials: [...fixture.parent.sourceMaterials, fixture.parent.sourceMaterials[0]!] });
      let failure: { readonly code?: string; readonly constraint_name?: string; readonly message?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23514");
      expect(failure?.message).toContain("M5_SUSPICIOUS_COMPLETE_COVERAGE_MEMBER_SET_INVALID");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a COMPLETE coverage whose evaluated set differs from its required set", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "evaluated-set-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "evaluated-set-mismatch", baseline });
      const parent = Object.freeze({ ...fixture.parent, evaluatedRuleIds: fixture.parent.evaluatedRuleIds.slice(0, -1), evaluatedRuleCount: 1, sourceMaterials: fixture.parent.sourceMaterials.slice(0, -1) });
      let failure: { readonly code?: string; readonly constraint_name?: string; readonly message?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, parent); await insertCoverageInput(tx, fixture.inputs[0]!); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23514");
      expect(failure?.message).toContain("violates check constraint");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_authorities_check3");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an extra coverage input before it can weaken the sealed set", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "extra-coverage-input" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "extra-coverage-input", baseline });
      const extra = Object.freeze({ ...fixture.inputs[0]!, ruleOrdinal: 2, ruleId: "RULE_UNPERSISTED", ruleFingerprint: sha("a") });
      let failure: { readonly code?: string; readonly constraint_name?: string; readonly message?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertCoverageInput(tx, extra); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_rule_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an input whose persisted rule-member fingerprint is wrong", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "wrong-rule-member-fingerprint" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "wrong-rule-member-fingerprint", baseline });
      const wrong = Object.freeze({ ...fixture.inputs[0]!, ruleFingerprint: sha("f") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, wrong); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_rule_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects duplicate coverage input ordinals and rule IDs", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      for (const duplicateKind of ["ordinal", "rule-id"] as const) {
        const caseName = `duplicate-input-${duplicateKind}`;
        const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName });
        const fixture = buildValidCoverageSqlFixture({ runSeed, caseName, baseline });
        const duplicate = duplicateKind === "ordinal"
          ? Object.freeze({ ...fixture.inputs[0]! })
          : Object.freeze({ ...fixture.inputs[0]!, ruleOrdinal: 1 });
        let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
        try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, fixture.inputs[0]!); await insertCoverageInput(tx, duplicate); }); } catch (error) { failure = error as typeof failure; }
        expect(failure?.code).toBe("23505");
        expect(failure?.constraint_name).toBe(duplicateKind === "ordinal" ? "m5_suspicious_coverage_rule_inputs_pkey" : "m5_suspicious_coverage_rule_i_coverage_authority_id_rule_id_key");
        const [parents, inputs] = await Promise.all([
          verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
          verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        ]);
        expect((parents[0] as { count: number }).count).toBe(0);
        expect((inputs[0] as { count: number }).count).toBe(0);
      }
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a NULL material fingerprint without weakening production row types", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "null-material-fingerprint" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "null-material-fingerprint", baseline });
      const nullFingerprint = Object.freeze({ ...fixture.inputs[0]!, materialFingerprint: null }) as unknown as CoverageInputInsertRow;
      let failure: { readonly code?: string; readonly column_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, nullFingerprint); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23502");
      expect(failure?.column_name).toBe("material_fingerprint");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects blank and noncanonical material fingerprints", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      for (const [caseName, materialFingerprint] of [["blank-material-fingerprint", "   "], ["uppercase-material-fingerprint", "A".repeat(64)]] as const) {
        const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName });
        const fixture = buildValidCoverageSqlFixture({ runSeed, caseName, baseline });
        const invalid = Object.freeze({ ...fixture.inputs[0]!, materialFingerprint });
        let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
        try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, invalid); }); } catch (error) { failure = error as typeof failure; }
        expect(failure?.code).toBe("23514");
        expect(failure?.constraint_name).toBe("m5_suspicious_coverage_rule_inputs_material_fingerprint_check");
        const [parents, inputs] = await Promise.all([
          verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
          verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        ]);
        expect((parents[0] as { count: number }).count).toBe(0);
        expect((inputs[0] as { count: number }).count).toBe(0);
      }
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a source-lineage member composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "lineage-member-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "lineage-member-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, sourceLineageMemberOrdinal: 99 });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_lineage_member_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an availability-claim composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "availability-claim-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "availability-claim-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, availabilityClaimFingerprint: sha("f") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_claim_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an artifact authority composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "artifact-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "artifact-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, sourceArtifactFingerprint: sha("f") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_artifact_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an envelope/artifact composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "envelope-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "envelope-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, sourceEnvelopeFingerprint: sha("f") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_envelope_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an observation/artifact/timestamp composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "observation-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "observation-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, sourceObservationFingerprint: sha("f") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_observation_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a non-existent ingestion-attempt binding", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "attempt-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "attempt-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, ingestionAttemptId: scoped("attempt-mismatch", "unpersisted-attempt") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_lineage_member_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a provider cross-scope composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "provider-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "provider-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, providerId: scoped("provider-mismatch", "foreign-provider") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_lineage_member_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a dataset cross-scope composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "dataset-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "dataset-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, datasetId: scoped("dataset-mismatch", "foreign-dataset") });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_lineage_member_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a dataset-version cross-scope composite mismatch", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "dataset-version-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "dataset-version-mismatch", baseline });
      const mismatch = Object.freeze({ ...fixture.inputs[0]!, datasetVersion: "truth/foreign-v1" });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); await insertCoverageInput(tx, mismatch); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("m5_suspicious_coverage_inputs_lineage_member_fk");
      const [parents, inputs] = await Promise.all([
        verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
        verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`,
      ]);
      expect((parents[0] as { count: number }).count).toBe(0);
      expect((inputs[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment with a mismatched coverage fingerprint", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-coverage-fingerprint-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-coverage-fingerprint-mismatch", baseline });
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), coverageFingerprint: sha("f") };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_coverage_authority_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment with a mismatched rule-set authority pair", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-rule-set-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-rule-set-mismatch", baseline });
      const alternate = createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: scoped("assessment-rule-set-mismatch", "alternate-rules"), providerId: baseline.providerId, datasetId: baseline.datasetId, datasetVersion: baseline.datasetVersion, detectorVersion: scoped("assessment-rule-set-mismatch", "alternate-detector"), requiredRuleIds: baseline.rules.map(rule => rule.ruleId) });
      await createM5SuspiciousCoveragePersistenceUnitOfWork(sql).withTransaction(repositories => repositories.ruleSets.save(alternate));
      const alternateStored = await createM5SuspiciousCoveragePersistenceUnitOfWork(sql).withTransaction(repositories => repositories.ruleSets.readById(alternate.ruleSetAuthorityId));
      if (!alternateStored) throw new Error("M5_TEST_ALTERNATE_RULE_SET_NOT_PERSISTED");
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), ruleSetAuthorityId: alternateStored.ruleSetAuthorityId, ruleSetFingerprint: alternateStored.fingerprint };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_coverage_authority_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment with a mismatched mapping revision", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-mapping-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-mapping-mismatch", baseline });
      const alternateMappingId = scoped("assessment-mapping-mismatch", "alternate-mapping");
      await sql`insert into public.intelligence_asset_mapping_revisions (mapping_revision_id,mapping_revision_version,provider_id,dataset_id,dataset_version,source_lineage_id,provider_asset_identity_assertion_id,provider_asset_namespace,provider_asset_id,canonical_asset_id,canonical_identifier,asset_class,valid_from,valid_to,observed_at,available_at,source_record_ids,payload_fingerprint,fingerprint,recorded_at) select ${alternateMappingId},mapping_revision_version,provider_id,dataset_id,dataset_version,source_lineage_id,provider_asset_identity_assertion_id,provider_asset_namespace,provider_asset_id,canonical_asset_id,canonical_identifier,asset_class,valid_from,valid_to,observed_at,available_at,source_record_ids,payload_fingerprint,fingerprint,recorded_at from public.intelligence_asset_mapping_revisions where mapping_revision_id=${baseline.mappingRevisionId}`;
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), mappingRevisionId: alternateMappingId };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_coverage_authority_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment with a mismatched SourceLineage authority", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-lineage-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-lineage-mismatch", baseline });
      const alternatePackage = { ...packageValue("assessment-lineage-alternate"), providerId: baseline.providerId, datasetId: baseline.datasetId, datasetVersion: baseline.datasetVersion };
      const alternatePlan = buildManualIngestionToLineagePlan(alternatePackage);
      const alternateIngested = await executeManualIngestionToLineage(alternatePlan.package, { apply: true, unitOfWork: createPostgresManualIngestionToLineageUnitOfWork(sql) });
      if (alternateIngested.status !== "PERSISTED") throw new Error("M5_TEST_ALTERNATE_LINEAGE_NOT_PERSISTED");
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), sourceLineageId: alternateIngested.sourceLineageId };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_coverage_authority_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("commits structured input rows but rejects a tampered canonical material fingerprint on reread", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "canonical-input-material-fingerprint-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "canonical-input-material-fingerprint-mismatch", baseline });
      const tampered = Object.freeze({ ...fixture.inputs[0]!, materialFingerprint: sha("f") });
      await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of [tampered, fixture.inputs[1]!]) await insertCoverageInput(tx, input); });
      const stored = await verify`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${fixture.parent.coverageAuthorityId}`;
      expect((stored[0] as { count: number }).count).toBe(2);
      let failure: unknown;
      try { await verify.begin(async tx => createM5SuspiciousCoverageRepositories(tx).coverage.readById(fixture.parent.coverageAuthorityId)); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe("M5_COVERAGE_RULE_INPUT_SET_INVALID");
      expect((failure as Error).message).not.toContain(fixture.parent.coverageAuthorityId);
      expect((failure as Error).message).not.toContain(tampered.materialFingerprint);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("commits a structurally valid parent but rejects a tampered coverage fingerprint on reread", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "canonical-coverage-fingerprint-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "canonical-coverage-fingerprint-mismatch", baseline });
      const tampered = Object.freeze({ ...fixture.parent, coverageFingerprint: sha("f") });
      await sql.begin(async tx => { await insertCoverageParent(tx, tampered); for (const input of fixture.inputs) await insertCoverageInput(tx, input); });
      const stored = await verify`select count(*)::int as count from public.m5_suspicious_coverage_authorities where coverage_authority_id=${tampered.coverageAuthorityId}`;
      expect((stored[0] as { count: number }).count).toBe(1);
      let failure: unknown;
      try { await verify.begin(async tx => createM5SuspiciousCoverageRepositories(tx).coverage.readById(tampered.coverageAuthorityId)); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe("M5_SUSPICIOUS_COVERAGE_FINGERPRINT_MISMATCH");
      expect((failure as Error).message).not.toContain(tampered.coverageAuthorityId);
      expect((failure as Error).message).not.toContain(tampered.coverageFingerprint);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("commits and seals a FINDINGS_PRESENT assessment with its exact finding set", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-findings-present" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-findings-present", baseline });
      const finding = await createRawEligibilityEvidenceFromMapping({ unitOfWork: createRawEvidenceUnitOfWork(sql), value: { family: "SUSPICIOUS", evidenceId: scoped("assessment-findings-present", "finding"), candidateId: baseline.candidateId, mappingRevisionId: baseline.mappingRevisionId, payload: { flagCode: "RULE_A", severity: "HIGH", sourceSignalId: scoped("assessment-findings-present", "signal") } } });
      const references = [{ evidenceId: finding.evidenceId, fingerprint: finding.fingerprint }];
      const assessment = buildValidAssessmentInsertRow({ baseline, parent: fixture.parent, result: "FINDINGS_PRESENT", findingReferences: references });
      await sql.begin(async tx => {
        await insertCoverageParent(tx, fixture.parent);
        for (const input of fixture.inputs) await insertCoverageInput(tx, input);
        await insertAssessment(tx, assessment);
        await insertAssessmentFinding(tx, { assessment, memberOrdinal: 0, evidenceId: finding.evidenceId, evidenceFingerprint: finding.fingerprint });
      });
      const row = (await verify`select coverage_authority_id,coverage_fingerprint,coverage_status,rule_set_authority_id,mapping_revision_id,source_lineage_id,provider_id,dataset_id,dataset_version,result from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessment.suspiciousAssessmentId}`)[0] as Record<string, unknown>;
      expect(String(row.coverage_authority_id)).toBe(fixture.parent.coverageAuthorityId);
      expect(String(row.coverage_fingerprint)).toBe(fixture.parent.coverageFingerprint);
      expect(String(row.coverage_status)).toBe("COMPLETE");
      expect(String(row.rule_set_authority_id)).toBe(baseline.ruleSetAuthorityId);
      expect(String(row.mapping_revision_id)).toBe(baseline.mappingRevisionId);
      expect(String(row.source_lineage_id)).toBe(baseline.sourceLineageId);
      expect(String(row.provider_id)).toBe(baseline.providerId);
      expect(String(row.dataset_id)).toBe(baseline.datasetId);
      expect(String(row.dataset_version)).toBe(baseline.datasetVersion);
      expect(String(row.result)).toBe("FINDINGS_PRESENT");
      const findingRows = await verify`select evidence_id,evidence_fingerprint from public.eligibility_suspicious_assessment_findings where suspicious_assessment_id=${assessment.suspiciousAssessmentId} order by member_ordinal`;
      expect(findingRows).toHaveLength(1);
      expect(String((findingRows[0] as Record<string, unknown>).evidence_id)).toBe(finding.evidenceId);
      expect(String((findingRows[0] as Record<string, unknown>).evidence_fingerprint)).toBe(finding.fingerprint);
      const reread = await verify.begin(async tx => createM5SuspiciousAssessmentReadRepository(tx, createM5SuspiciousRuleSetAuthorityResolver([])).readSealedById(assessment.suspiciousAssessmentId));
      expect(reread?.assessment.result).toBe("FINDINGS_PRESENT");
      expect(reread?.assessment.coverageStatus).toBe("COMPLETE");
      expect(reread?.members).toEqual(references);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment provider scope mismatch at the coverage composite FK", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-provider-scope-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-provider-scope-mismatch", baseline });
      const other = await sql`select provider_id from public.intelligence_providers where provider_id <> ${baseline.providerId} order by provider_id limit 1`;
      if (other.length !== 1) throw new Error("M5_TEST_ALTERNATE_PROVIDER_NOT_FOUND");
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), providerId: String((other[0] as Record<string, unknown>).provider_id) };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_dataset_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment dataset scope mismatch at the coverage composite FK", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-dataset-scope-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-dataset-scope-mismatch", baseline });
      const other = await sql`select dataset_id from public.intelligence_datasets where dataset_id <> ${baseline.datasetId} order by dataset_id limit 1`;
      if (other.length !== 1) throw new Error("M5_TEST_ALTERNATE_DATASET_NOT_FOUND");
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), datasetId: String((other[0] as Record<string, unknown>).dataset_id) };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_dataset_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("rejects an assessment dataset-version scope mismatch at the coverage composite FK", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-version-scope-mismatch" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-version-scope-mismatch", baseline });
      const alternateVersion = `${baseline.datasetVersion}-mismatch`;
      await sql`insert into public.intelligence_datasets (dataset_id,provider_id,dataset_version,source_description,content_storage_mode) values (${baseline.datasetId},${baseline.providerId},${alternateVersion},'truth','METADATA_ONLY') on conflict do nothing`;
      const assessment = { ...buildValidAssessmentInsertRow({ baseline, parent: fixture.parent }), datasetVersion: alternateVersion };
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, fixture.parent); for (const input of fixture.inputs) await insertCoverageInput(tx, input); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_dataset_fk");
      await expectNoAssessmentRows(sql, assessment.suspiciousAssessmentId);
    } finally { await sql.end({ timeout: 5 }); }
  });
  it("commits and rereads a NO_FINDINGS assessment bound to actual COMPLETE coverage", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-complete-positive" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-complete-positive", baseline });
      const assessment = buildValidAssessmentInsertRow({ baseline, parent: fixture.parent });
      await sql.begin(async tx => {
        await insertCoverageParent(tx, fixture.parent);
        for (const input of fixture.inputs) await insertCoverageInput(tx, input);
        await insertAssessment(tx, assessment);
      });
      const rows = await verify`select coverage_authority_id,coverage_fingerprint,coverage_status,rule_set_authority_id,rule_set_fingerprint,mapping_revision_id,source_lineage_id,provider_id,dataset_id,dataset_version from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessment.suspiciousAssessmentId}`;
      expect(rows).toHaveLength(1);
      const row = rows[0] as Record<string, unknown>;
      expect(String(row.coverage_authority_id)).toBe(fixture.parent.coverageAuthorityId);
      expect(String(row.coverage_fingerprint)).toBe(fixture.parent.coverageFingerprint);
      expect(String(row.coverage_status)).toBe("COMPLETE");
      expect(String(row.rule_set_authority_id)).toBe(baseline.ruleSetAuthorityId);
      expect(String(row.rule_set_fingerprint)).toBe(baseline.ruleSetFingerprint);
      expect(String(row.mapping_revision_id)).toBe(baseline.mappingRevisionId);
      expect(String(row.source_lineage_id)).toBe(baseline.sourceLineageId);
      expect(String(row.provider_id)).toBe(baseline.providerId);
      expect(String(row.dataset_id)).toBe(baseline.datasetId);
      expect(String(row.dataset_version)).toBe(baseline.datasetVersion);
      const reread = await verify.begin(async tx => createM5SuspiciousAssessmentReadRepository(tx, createM5SuspiciousRuleSetAuthorityResolver([])).readSealedById(assessment.suspiciousAssessmentId));
      expect(reread?.assessment.fingerprint).toBe(assessment.fingerprint);
      expect(reread?.assessment.coverageStatus).toBe("COMPLETE");
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a COMPLETE assessment bound to an actual INCOMPLETE coverage parent", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-incomplete-parent" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-incomplete-parent", baseline });
      const parent = Object.freeze({ ...fixture.parent, coverageAuthorityId: scoped("assessment-incomplete-parent", "coverage"), coverageStatus: "INCOMPLETE" as const });
      const assessment = buildValidAssessmentInsertRow({ baseline, parent });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, parent); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_coverage_authority_fk");
      const [assessments, findings] = await Promise.all([
        verify`select count(*)::int as count from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessment.suspiciousAssessmentId}`,
        verify`select count(*)::int as count from public.eligibility_suspicious_assessment_findings where suspicious_assessment_id=${assessment.suspiciousAssessmentId}`,
      ]);
      expect((assessments[0] as { count: number }).count).toBe(0);
      expect((findings[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("rejects a COMPLETE assessment bound to an actual INVALID coverage parent", async () => {
    assertLocal(url!);
    const sql = postgres(url!, { max: 2, prepare: true });
    const verify = postgres(url!, { max: 1, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "assessment-invalid-parent" });
      const fixture = buildValidCoverageSqlFixture({ runSeed, caseName: "assessment-invalid-parent", baseline });
      const parent = Object.freeze({ ...fixture.parent, coverageAuthorityId: scoped("assessment-invalid-parent", "coverage"), coverageStatus: "INVALID" as const });
      const assessment = buildValidAssessmentInsertRow({ baseline, parent });
      let failure: { readonly code?: string; readonly constraint_name?: string } | undefined;
      try { await sql.begin(async tx => { await insertCoverageParent(tx, parent); await insertAssessment(tx, assessment); }); } catch (error) { failure = error as typeof failure; }
      expect(failure?.code).toBe("23503");
      expect(failure?.constraint_name).toBe("eligibility_suspicious_assessments_coverage_authority_fk");
      const [assessments, findings] = await Promise.all([
        verify`select count(*)::int as count from public.eligibility_suspicious_assessments where suspicious_assessment_id=${assessment.suspiciousAssessmentId}`,
        verify`select count(*)::int as count from public.eligibility_suspicious_assessment_findings where suspicious_assessment_id=${assessment.suspiciousAssessmentId}`,
      ]);
      expect((assessments[0] as { count: number }).count).toBe(0);
      expect((findings[0] as { count: number }).count).toBe(0);
    } finally { await verify.end({ timeout: 5 }); await sql.end({ timeout: 5 }); }
  });
  it("persists a COMPLETE coverage baseline with structured lineage authority", async () => {
    assertLocal(url!); const sql = postgres(url!, { max: 2, prepare: true });
    try {
      const baseline = await createPersistedSuspiciousCoverageBaseline({ sql, runSeed, caseName: "structured-provenance-positive" });
      const materials = baseline.lineageMembers.map(member => ({ materialId: member.sourceArtifactId! }));
      const ruleSet = await createM5SuspiciousCoveragePersistenceUnitOfWork(sql).withTransaction(repositories => repositories.ruleSets.readById(baseline.ruleSetAuthorityId));
      if (!ruleSet) throw new Error("M5_TRUTH_RULE_SET_REREAD_NOT_FOUND");
      const assessment = await persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: createM5SuspiciousAssessmentUnitOfWork(sql, createM5SuspiciousRuleSetAuthorityResolver([ruleSet])), request: { result: "NO_FINDINGS", ruleSetVersion: baseline.ruleSetVersion, detectorVersion: baseline.detectorVersion, ruleSetAuthorityId: baseline.ruleSetAuthorityId, asOf: baseline.asOf, recordedAt: asOf, candidateId: baseline.candidateId, assetId: baseline.assetId, canonicalIdentifier: baseline.canonicalIdentifier, assetClass: baseline.assetClass, mappingRevisionId: baseline.mappingRevisionId, sourceLineageId: baseline.sourceLineageId, findingEvidenceIds: [] }, evaluation: { evaluatedRuleIds: baseline.rules.map(rule => rule.ruleId), materials } });
      expect(assessment.coverageStatus).toBe("COMPLETE");
      if (!assessment.coverageAuthorityId) throw new Error("M5_TRUTH_ASSESSMENT_COVERAGE_ID_MISSING");
      expect((await sql`select count(*)::int as count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id=${assessment.coverageAuthorityId}`)[0]!.count).toBe(2);
    } finally { await sql.end({ timeout: 5 }); }
  });
});
