import { encodeM5DatasetPin } from "@/domain/intelligence/m5-dataset-pin";
import { createM5SuspiciousAssessment, type M5SuspiciousAssessment } from "@/domain/intelligence/m5-suspicious-assessment";
import { assertM5SuspiciousRuleSetAuthority } from "@/domain/intelligence/m5-suspicious-rule-set";
import { assertM5SuspiciousCoverageAuthority, createM5SuspiciousCoverageAuthority, type M5SuspiciousCoverageAuthority } from "@/domain/intelligence/m5-suspicious-coverage";
import type { M5SuspiciousAssessmentRepositories, M5SuspiciousAssessmentUnitOfWork, CreateM5SuspiciousAssessmentRequest } from "@/application/intelligence/m5-suspicious-assessment-repository";

const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);

async function persistAssessmentInRepositories(repositories: M5SuspiciousAssessmentRepositories, request: CreateM5SuspiciousAssessmentRequest): Promise<M5SuspiciousAssessment> {
    const mapping = await repositories.mappings.readById(request.mappingRevisionId);
    if (!mapping) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MAPPING_NOT_FOUND");
    if (mapping.sourceLineageId !== request.sourceLineageId || mapping.canonicalIdentifier !== request.canonicalIdentifier || mapping.assetClass !== request.assetClass || mapping.canonicalAssetId !== request.assetId) throw new Error("M5_SUSPICIOUS_ASSESSMENT_SCOPE_MISMATCH");
    if (mapping.providerId === "" || mapping.datasetId === "" || mapping.datasetVersion === "") throw new Error("M5_SUSPICIOUS_ASSESSMENT_SCOPE_INVALID");
    if (!repositories.ruleSets.readById) throw new Error("M5_SUSPICIOUS_ASSESSMENT_PERSISTED_RULE_SET_READER_REQUIRED");
    const ruleSet = await repositories.ruleSets.readById(request.ruleSetAuthorityId!);
    if (!ruleSet) throw new Error("M5_SUSPICIOUS_ASSESSMENT_RULE_SET_NOT_FOUND");
    assertM5SuspiciousRuleSetAuthority(ruleSet);
    if (ruleSet.providerId !== mapping.providerId || ruleSet.datasetId !== mapping.datasetId || ruleSet.datasetVersion !== mapping.datasetVersion || ruleSet.detectorVersion !== request.detectorVersion || ruleSet.ruleSetVersion !== request.ruleSetVersion) throw new Error("M5_SUSPICIOUS_ASSESSMENT_RULE_SET_SCOPE_MISMATCH");
    if (!repositories.coverage) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_REPOSITORY_REQUIRED");
    const coverage = await repositories.coverage.readById(request.coverageAuthorityId!);
    if (!coverage) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_NOT_FOUND");
    assertM5SuspiciousCoverageAuthority(coverage);
    if (coverage.status !== "COMPLETE" || coverage.fingerprint !== request.coverageFingerprint || coverage.ruleSetAuthorityId !== request.ruleSetAuthorityId || coverage.ruleSetFingerprint !== ruleSet.fingerprint || coverage.evaluatedRuleIds.length !== request.evaluatedRuleCount || coverage.requiredRuleIds.length !== coverage.evaluatedRuleIds.length || coverage.requiredRuleIds.some((id, index) => id !== coverage.evaluatedRuleIds[index])) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_BINDING_INVALID");
    const lineage = await repositories.lineages.validateForRawEvidenceCreation(request.sourceLineageId);
    const members = await repositories.lineages.readMembers(request.sourceLineageId);
    if (lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_SCOPE_MISMATCH");
    if (mapping.payloadFingerprint !== lineage.fingerprint || !same(mapping.sourceRecordIds, lineage.sourceArtifactIds) || mapping.observedAt !== lineage.observedAt || mapping.availableAt !== lineage.effectiveAvailableAt) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_BINDING_INVALID");
    if (members.length !== lineage.memberCount || members.some(member => member.sourceLineageId !== lineage.sourceLineageId || member.providerId !== lineage.providerId || member.datasetId !== lineage.datasetId || member.datasetVersion !== lineage.datasetVersion)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_MEMBERS_INVALID");
    const findingIds = [...request.findingEvidenceIds].sort((a, b) => a.localeCompare(b));
    if (new Set(findingIds).size !== findingIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_DUPLICATE_FINDING");
    if (request.result === "NO_FINDINGS" && findingIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_NO_FINDINGS_HAS_FINDINGS");
    if (request.result === "FINDINGS_PRESENT" && !findingIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDINGS_EMPTY");
    const pins = [{ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion }];
    const findings = await repositories.findings.readExact({ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, candidateId: request.candidateId, assetId: request.assetId, canonicalIdentifier: request.canonicalIdentifier, assetClass: request.assetClass, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: mapping.sourceLineageId, asOf: request.asOf, pins });
    const found = [...findings].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
    if (!same(found.map(value => value.evidenceId), findingIds)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDING_SET_MISMATCH");
    const references = found.map(value => ({ evidenceId: value.evidenceId, fingerprint: value.fingerprint }));
    const assessment = createM5SuspiciousAssessment({
      contractVersion: "m5-suspicious-assessment/v1",
      providerId: mapping.providerId,
      datasetId: mapping.datasetId,
      datasetVersion: mapping.datasetVersion,
      candidateId: request.candidateId,
      assetId: request.assetId,
      canonicalIdentifier: request.canonicalIdentifier,
      assetClass: request.assetClass,
      mappingRevisionId: mapping.mappingRevisionId,
      sourceLineageId: mapping.sourceLineageId,
      ruleSetVersion: ruleSet.ruleSetVersion,
      ruleSetFingerprint: ruleSet.fingerprint,
      ruleSetAuthorityId: request.ruleSetAuthorityId ?? ruleSet.ruleSetAuthorityId,
      coverageAuthorityId: request.coverageAuthorityId,
      coverageFingerprint: request.coverageFingerprint,
      evaluatedRuleCount: request.evaluatedRuleCount,
      coverageStatus: request.coverageStatus,
      detectorVersion: ruleSet.detectorVersion,
      coveredRuleIds: ruleSet.requiredRuleIds,
      result: request.result,
      findingReferences: references,
      asOf: request.asOf,
      observedAt: lineage.observedAt,
      availableAt: lineage.effectiveAvailableAt,
      sourceRecordIds: lineage.sourceArtifactIds,
      payloadFingerprint: lineage.fingerprint,
      datasetPins: [encodeM5DatasetPin({ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion })],
      recordedAt: request.recordedAt,
    });
    const stored = await repositories.assessments.save(assessment);
    await repositories.memberships.save(stored, references);
    const reread = await repositories.assessments.readSealedById(stored.suspiciousAssessmentId);
    if (!reread) throw new Error("M5_SUSPICIOUS_ASSESSMENT_REREAD_NOT_FOUND");
    return reread.assessment;
}

export async function createM5SuspiciousAssessmentAuthority(input: Readonly<{ unitOfWork: M5SuspiciousAssessmentUnitOfWork; request: CreateM5SuspiciousAssessmentRequest }>): Promise<M5SuspiciousAssessment> {
  if (!input.request.ruleSetAuthorityId || !input.request.coverageAuthorityId || !input.request.coverageFingerprint || input.request.evaluatedRuleCount === undefined || input.request.coverageStatus !== "COMPLETE") throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_AUTHORITY_REQUIRED");
  return input.unitOfWork.withTransaction(repositories => persistAssessmentInRepositories(repositories, input.request));
}

/**
 * Authoritative v1 creation path.  The caller supplies only the stable rule
 * set key and evaluation observations.  All provenance, scope, timestamps,
 * identity and coverage IDs are reconstructed from the mapping and sealed
 * SourceLineage inside one transaction.
 */
export async function persistM5SuspiciousAssessmentWithCoverage(input: Readonly<{
  unitOfWork: M5SuspiciousAssessmentUnitOfWork;
  request: Omit<CreateM5SuspiciousAssessmentRequest, "coverageAuthorityId" | "coverageFingerprint" | "evaluatedRuleCount" | "coverageStatus"> & { ruleSetAuthorityId: string };
  evaluation: Readonly<{ evaluatedRuleIds: readonly string[]; materials: M5SuspiciousCoverageAuthority["materials"] }>;
}>): Promise<M5SuspiciousAssessment> {
  return input.unitOfWork.withTransaction(async repositories => {
    if (!repositories.ruleSets.readById) throw new Error("M5_SUSPICIOUS_ASSESSMENT_PERSISTED_RULE_SET_READER_REQUIRED");
    if (!repositories.coverage?.save) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_WRITER_REQUIRED");
    const request = input.request;
    const mapping = await repositories.mappings.readById(request.mappingRevisionId);
    if (!mapping) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MAPPING_NOT_FOUND");
    if (mapping.sourceLineageId !== request.sourceLineageId || mapping.canonicalIdentifier !== request.canonicalIdentifier || mapping.assetClass !== request.assetClass || mapping.canonicalAssetId !== request.assetId) throw new Error("M5_SUSPICIOUS_ASSESSMENT_SCOPE_MISMATCH");
    const ruleSet = await repositories.ruleSets.readById(request.ruleSetAuthorityId);
    if (!ruleSet) throw new Error("M5_SUSPICIOUS_ASSESSMENT_RULE_SET_NOT_FOUND");
    assertM5SuspiciousRuleSetAuthority(ruleSet);
    if (ruleSet.providerId !== mapping.providerId || ruleSet.datasetId !== mapping.datasetId || ruleSet.datasetVersion !== mapping.datasetVersion || ruleSet.ruleSetVersion !== request.ruleSetVersion || ruleSet.detectorVersion !== request.detectorVersion) throw new Error("M5_SUSPICIOUS_ASSESSMENT_RULE_SET_SCOPE_MISMATCH");
    const lineage = await repositories.lineages.validateForRawEvidenceCreation(mapping.sourceLineageId);
    const members = await repositories.lineages.readMembers(mapping.sourceLineageId);
    if (lineage.fingerprint !== mapping.payloadFingerprint || lineage.sourceLineageId !== mapping.sourceLineageId || members.length !== lineage.memberCount) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_BINDING_INVALID");
    if (!repositories.lineages.readMemberAuthorities) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_AUTHORITY_READER_REQUIRED");
    const authorities = await repositories.lineages.readMemberAuthorities(mapping.sourceLineageId);
    const suppliedMaterials = [...input.evaluation.materials].sort((a, b) => a.materialId.localeCompare(b.materialId));
    const authoritativeMaterials = authorities.map(authority => ({ materialId: authority.artifact.sourceArtifactId, artifactId: authority.artifact.sourceArtifactId, envelopeId: authority.envelope.sourceEnvelopeId, observationId: authority.observation.sourceObservationId, payloadFingerprint: authority.artifact.payloadFingerprint, observedAt: authority.envelope.observedAt, availableAt: authority.observation.retrievedAt })).sort((a, b) => a.materialId.localeCompare(b.materialId));
    if (suppliedMaterials.length !== authoritativeMaterials.length || suppliedMaterials.some((value, index) => JSON.stringify(value) !== JSON.stringify(authoritativeMaterials[index]))) throw new Error("M5_SUSPICIOUS_ASSESSMENT_SOURCE_MATERIAL_BINDING_INVALID");
    const coverage = createM5SuspiciousCoverageAuthority({
      contractVersion: "m5-suspicious-coverage-authority/v1",
      ruleSetAuthorityId: ruleSet.ruleSetAuthorityId,
      ruleSetFingerprint: ruleSet.fingerprint,
      providerId: mapping.providerId,
      datasetId: mapping.datasetId,
      datasetVersion: mapping.datasetVersion,
      mappingRevisionId: mapping.mappingRevisionId,
      providerAssetIdentityAssertionId: mapping.providerAssetIdentityAssertionId,
      sourceLineageId: lineage.sourceLineageId,
      sourceLineageFingerprint: lineage.fingerprint,
      candidateId: request.candidateId,
      assetId: mapping.canonicalAssetId,
      canonicalIdentifier: mapping.canonicalIdentifier,
      assetClass: mapping.assetClass,
      asOf: request.asOf,
      requiredRuleIds: ruleSet.requiredRuleIds,
      evaluatedRuleIds: input.evaluation.evaluatedRuleIds,
      materials: input.evaluation.materials,
      status: "COMPLETE",
      observedAt: lineage.observedAt,
      availableAt: lineage.effectiveAvailableAt,
      recordedAt: request.recordedAt,
    });
    const storedCoverage = await repositories.coverage.save(coverage);
    const rereadCoverage = await repositories.coverage.readById(storedCoverage.coverageAuthorityId);
    if (!rereadCoverage) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_REREAD_NOT_FOUND");
    assertM5SuspiciousCoverageAuthority(rereadCoverage);
    if (rereadCoverage.fingerprint !== coverage.fingerprint || rereadCoverage.status !== "COMPLETE") throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_BINDING_INVALID");
    const assessment = await persistAssessmentInRepositories(repositories, { ...request, ruleSetAuthorityId: ruleSet.ruleSetAuthorityId, coverageAuthorityId: rereadCoverage.coverageAuthorityId, coverageFingerprint: rereadCoverage.fingerprint, evaluatedRuleCount: rereadCoverage.evaluatedRuleIds.length, coverageStatus: "COMPLETE" });
    return assessment;
  });
}

/** Strict v1 entry point.  Coverage is persisted/re-read by the caller's
 * transaction-scoped repository before this function is invoked. */
export async function createM5SuspiciousAssessmentFromCompleteCoverage(input: Readonly<{
  unitOfWork: M5SuspiciousAssessmentUnitOfWork;
  request: CreateM5SuspiciousAssessmentRequest & { ruleSetAuthorityId: string; coverageAuthorityId: string; coverageFingerprint: string; evaluatedRuleCount: number; coverageStatus?: "COMPLETE" };
  coverage: M5SuspiciousCoverageAuthority;
}>): Promise<M5SuspiciousAssessment> {
  assertM5SuspiciousCoverageAuthority(input.coverage);
  if (input.coverage.status !== "COMPLETE") throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_NOT_COMPLETE");
  if (input.coverage.ruleSetAuthorityId !== input.request.ruleSetAuthorityId || input.coverage.coverageAuthorityId !== input.request.coverageAuthorityId || input.coverage.fingerprint !== input.request.coverageFingerprint) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_BINDING_MISMATCH");
  if (input.request.evaluatedRuleCount !== input.coverage.evaluatedRuleIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_EVALUATED_RULE_COUNT_INVALID");
  return createM5SuspiciousAssessmentAuthority({ unitOfWork: input.unitOfWork, request: { ...input.request, coverageStatus: "COMPLETE" } });
}
